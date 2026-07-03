import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHttpServer, type RunningServer } from "./server.js";
import { httpSales, httpCreative, httpSignals } from "./client.js";
import { SalesAgent } from "../agents/sales-agent.js";
import { CreativeAgent } from "../agents/creative-agent.js";
import { SignalsAgent } from "../agents/signals-agent.js";
import { GovernanceAgent } from "../buyer/governance.js";
import { Orchestrator } from "../buyer/orchestrator.js";
import { DEFAULT_POLICY, AUTO_APPROVER } from "../suite.js";
import { deterministicRuntime } from "../core/runtime.js";

let server: RunningServer;

beforeAll(async () => {
  const rt = deterministicRuntime("2026-03-15T00:00:00.000Z");
  const node = {
    name: "suite",
    sales: new SalesAgent({ runtime: rt }),
    creative: new CreativeAgent({ runtime: rt }),
    signals: new SignalsAgent({ runtime: rt }),
  };
  server = await startHttpServer({ node, port: 0 });
});

afterAll(async () => {
  await server.close();
});

describe("HTTP transport", () => {
  it("serves discovery documents", async () => {
    const adagents = await (await fetch(`${server.url}/.well-known/adagents.json`)).json();
    expect(adagents.publisher.domain).toBeDefined();
    expect(adagents.agents[0].capabilities).toContain("get_products");

    const brand = await (await fetch(`${server.url}/.well-known/brand.json`)).json();
    expect(brand.house).toBeDefined();

    const caps = await (await fetch(`${server.url}/capabilities`)).json();
    expect(caps.domains).toEqual(expect.arrayContaining(["media-buy", "creative", "signals"]));
  });

  it("invokes tasks over REST", async () => {
    const sales = httpSales(server.url);
    const { products } = await sales.getProducts({ buying_mode: "brief", brief: "sports ctv" });
    expect(products.length).toBeGreaterThan(0);
  });

  it("returns structured errors with proper status", async () => {
    const res = await fetch(`${server.url}/tasks/get_media_buy_delivery`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
  });

  it("supports JSON-RPC 2.0", async () => {
    const res = await fetch(`${server.url}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "get_signals", params: { signal_spec: "outdoor" } }),
    });
    const body = await res.json();
    expect(body.id).toBe(7);
    expect(body.result.signals.length).toBeGreaterThan(0);
  });

  it("runs a full orchestrated campaign against remote HTTP agents", async () => {
    const rt = deterministicRuntime("2026-03-15T00:00:00.000Z");
    const orchestrator = new Orchestrator({
      sellers: [{ name: "StreamHaus", agentUrl: server.url, sales: httpSales(server.url) }],
      creative: httpCreative(server.url),
      signals: httpSignals(server.url),
      governance: new GovernanceAgent(DEFAULT_POLICY, AUTO_APPROVER, rt),
      runtime: rt,
    });
    const result = await orchestrator.runCampaign({
      name: "RemoteQ2",
      brief: "premium sports ctv video outdoor across ctv and olv",
      brand: { domain: "acme.com" },
      account: { brand: { domain: "acme.com" }, operator: "agency.com", billing: "operator" },
      total_budget: 40000,
      channels: ["ctv", "olv", "display"],
      start_time: "2026-04-01T00:00:00.000Z",
      end_time: "2026-06-30T00:00:00.000Z",
      signal_spec: "outdoor sporting goods",
    });
    expect(result.status).toBe("executed");
    expect(result.media_buys).toHaveLength(1);
    const delivery = await orchestrator.collectDelivery(result);
    expect(delivery[0].media_buy_id).toBe(result.media_buys[0].media_buy.media_buy_id);
  });
});
