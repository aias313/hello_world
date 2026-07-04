import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startSuiteServer } from "./suite-server.js";
import type { Suite } from "../suite.js";

let server: Awaited<ReturnType<typeof startSuiteServer>>;
let suite: Suite;

function url(p: string): string {
  return server.url + p;
}
async function getJson(p: string) {
  const r = await fetch(url(p));
  return { status: r.status, body: await r.json() };
}
async function postJson(p: string, body?: unknown) {
  const r = await fetch(url(p), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return { status: r.status, body: await r.json() };
}

beforeAll(async () => {
  server = await startSuiteServer({ port: 0 });
  suite = server.suite;
});

afterAll(async () => {
  await server.close();
});

describe("suite server", () => {
  it("serves the dashboard HTML at /", async () => {
    const r = await fetch(url("/"));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/text\/html/);
    const html = await r.text();
    expect(html).toContain("AdCP Campaign Studio");
    expect(html).toContain("Launch a new campaign");
  });

  it("still exposes the raw agent transport on the same port", async () => {
    const caps = await getJson("/capabilities");
    expect(caps.body.domains).toContain("media-buy");
    const adagents = await getJson("/.well-known/adagents.json");
    expect(adagents.body.agents[0].capabilities).toContain("get_products");
  });

  it("starts with an empty overview", async () => {
    const { body } = await getJson("/api/overview");
    expect(body.campaigns).toBe(0);
    expect(body.total_spend).toBe(0);
  });

  it("launches a campaign through the API and lists it", async () => {
    const now = Date.now();
    const { status, body } = await postJson("/api/campaigns", {
      name: "API Test Campaign",
      brief: "premium sports ctv video for outdoor enthusiasts",
      brand_name: "Acme",
      brand_domain: "acme.com",
      total_budget: 30000,
      start_time: new Date(now - 10 * 86400000).toISOString(),
      end_time: new Date(now + 10 * 86400000).toISOString(),
      channels: ["ctv", "olv", "display"],
      signal_spec: "outdoor sporting goods",
    });
    expect(status).toBe(201);
    expect(body.summary.status).toBe("executed");
    expect(body.result.media_buys).toHaveLength(1);
    expect(body.delivery.length).toBe(1);
    // mid-flight: real spend should already be accruing (system clock)
    expect(body.summary.spend).toBeGreaterThan(0);
    expect(body.audit_log.length).toBeGreaterThan(0);

    const list = await getJson("/api/campaigns");
    expect(list.body.campaigns).toHaveLength(1);
    expect(list.body.campaigns[0].name).toBe("API Test Campaign");
  });

  it("returns friendly validation errors", async () => {
    const bad = await postJson("/api/campaigns", { name: "x" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("invalid_request");

    const missing = await getJson("/api/campaigns/nope");
    expect(missing.status).toBe(404);
  });

  it("pauses and resumes a campaign", async () => {
    const list = await getJson("/api/campaigns");
    const id = list.body.campaigns[0].plan_id;

    const paused = await postJson(`/api/campaigns/${id}/pause`);
    expect(paused.status).toBe(200);
    expect(paused.body.summary.delivery_status).toBe("paused");

    const resumed = await postJson(`/api/campaigns/${id}/resume`);
    expect(resumed.body.summary.delivery_status).toBe("active");
  });

  it("logs conversions and feedback", async () => {
    const list = await getJson("/api/campaigns");
    const id = list.body.campaigns[0].plan_id;

    const conv = await postJson(`/api/campaigns/${id}/conversions`, { event_type: "purchase", value: 99.5 });
    expect(conv.body.accepted).toBe(1);
    expect(suite.sales.store.events.length).toBeGreaterThan(0);

    const fb = await postJson(`/api/campaigns/${id}/feedback`, { performance_index: 1.2 });
    expect(fb.body.accepted).toBe(true);
  });

  it("serves discovery previews", async () => {
    const prods = await getJson("/api/products?brief=" + encodeURIComponent("sports ctv"));
    expect(prods.body.products.length).toBeGreaterThan(0);
    const sigs = await getJson("/api/signals?spec=" + encodeURIComponent("outdoor"));
    expect(sigs.body.signals.length).toBeGreaterThan(0);
    const creatives = await getJson("/api/creatives");
    expect(creatives.body.creatives.length).toBeGreaterThan(0); // built during launch
  });

  it("creates a mid-flight sample campaign", async () => {
    const { status, body } = await postJson("/api/sample");
    expect(status).toBe(201);
    expect(body.summary.status).toBe("executed");
    expect(body.summary.spend).toBeGreaterThan(0); // mid-flight by construction
    const overview = await getJson("/api/overview");
    expect(overview.body.campaigns).toBe(2);
  });
});
