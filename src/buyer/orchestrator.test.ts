import { describe, it, expect } from "vitest";
import { createSuite } from "../suite.js";
import { FixedClock } from "../core/runtime.js";
import { allocate } from "./orchestrator.js";
import type { CampaignBrief } from "./orchestrator.js";
import type { SellerConnection } from "./orchestrator.js";
import type { Product } from "../core/schemas.js";

const brief: CampaignBrief = {
  name: "Q2",
  brief: "premium sports ctv video for outdoor enthusiasts across ctv and online video",
  brand: { domain: "acme.com", name: "Acme" },
  account: { brand: { domain: "acme.com" }, operator: "agency.com", billing: "operator" },
  total_budget: 50000,
  currency: "USD",
  channels: ["ctv", "olv", "display", "audio"],
  start_time: "2026-04-01T00:00:00.000Z",
  end_time: "2026-06-30T00:00:00.000Z",
  max_products: 3,
  signal_spec: "outdoor recreation sporting goods",
};

describe("Orchestrator full lifecycle", () => {
  it("runs discover→signals→creative→govern→sync→buy end-to-end", async () => {
    const suite = createSuite({ deterministic: true, startTime: "2026-03-15T00:00:00.000Z" });
    const result = await suite.orchestrator.runCampaign(brief);

    expect(result.status).toBe("executed");
    expect(result.selected.length).toBe(3);
    expect(result.activated_signals.length).toBeGreaterThan(0);
    expect(result.creative_set_id).toBeDefined();
    expect(result.media_buys).toHaveLength(1);

    // budget conserved exactly
    const total = result.selected.reduce((s, x) => s + x.budget, 0);
    expect(Math.round(total)).toBe(50000);

    // every package got at least one approved creative assigned
    const mb = result.media_buys[0].media_buy;
    expect(mb.packages.every((p) => p.creative_ids.length > 0)).toBe(true);
    expect(mb.packages.every((p) => p.signal_ids.length > 0)).toBe(true);

    // governance escalated (budget 50k >= 20k threshold) but proceeded
    expect(result.governance.result).toBe("escalated");
  });

  it("delivery accrues and feedback is accepted", async () => {
    const suite = createSuite({ deterministic: true, startTime: "2026-03-15T00:00:00.000Z" });
    const result = await suite.orchestrator.runCampaign(brief);
    const clock = suite.runtime.clock as FixedClock;

    clock.set("2026-07-01T00:00:00.000Z");
    const reports = await suite.orchestrator.collectDelivery(result);
    const spend = reports.reduce((s, r) => s + r.spend.amount, 0);
    expect(spend).toBeGreaterThan(40000);
    expect(reports[0].status).toBe("completed");

    await expect(suite.orchestrator.sendFeedback(result, 1.3)).resolves.toBeUndefined();
  });

  it("establishes an account and records conversions end-to-end", async () => {
    const suite = createSuite({ deterministic: true, startTime: "2026-03-15T00:00:00.000Z" });
    const result = await suite.orchestrator.runCampaign(brief);
    expect(result.status).toBe("executed");

    // account was provisioned on the seller during the buy
    expect(suite.sales.listAccounts().accounts).toHaveLength(1);
    expect(suite.sales.listAccounts().accounts[0].status).toBe("active");

    // conversions flow through event source + log_event
    const accepted = await suite.orchestrator.recordConversions(result, [
      { event_id: "c1", event_type: "purchase", event_time: "2026-06-20T00:00:00.000Z", custom_data: { value: 99 } },
      { event_id: "c2", event_type: "lead", event_time: "2026-06-21T00:00:00.000Z" },
    ]);
    expect(accepted).toBe(2);
    expect(suite.sales.store.events).toHaveLength(2);
  });

  it("stops when governance denies (brand-safety)", async () => {
    const suite = createSuite({
      deterministic: true,
      policy: { blockedKeywords: ["sports"] }, // force a denial via the brief
    });
    const result = await suite.orchestrator.runCampaign(brief);
    expect(result.status).toBe("denied");
    expect(result.media_buys).toHaveLength(0);
  });

  it("reports no_inventory when channels exclude everything", async () => {
    const suite = createSuite({ deterministic: true });
    const result = await suite.orchestrator.runCampaign({ ...brief, channels: ["social"] });
    expect(result.status).toBe("no_inventory");
  });
});

describe("allocate()", () => {
  const seller = { name: "S", agentUrl: "x" } as SellerConnection;
  const product = (id: string, min = 0): Product => ({
    product_id: id,
    name: id,
    description: "",
    channels: ["display"],
    delivery_type: "non_guaranteed",
    is_fixed_price: false,
    pricing_options: [{ pricing_option_id: "o", model: "cpm", price: 5, currency: "USD", min_spend: min }],
    format_ids: [],
    targeting: { geos: [], age_ranges: [], interests: [] },
    keywords: [],
  });

  it("splits budget exactly across selected products", () => {
    const out = allocate(
      [
        { seller, product: product("a") },
        { seller, product: product("b") },
      ],
      30000,
      3,
    );
    expect(out.reduce((s, x) => s + x.budget, 0)).toBe(30000);
  });

  it("drops products whose combined min_spend exceeds the budget", () => {
    const out = allocate(
      [
        { seller, product: product("a", 8000) },
        { seller, product: product("b", 8000) },
      ],
      10000,
      3,
    );
    expect(out.length).toBe(1);
    expect(out[0].budget).toBe(10000);
  });
});
