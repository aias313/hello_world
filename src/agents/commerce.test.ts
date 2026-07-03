import { describe, it, expect } from "vitest";
import { SalesAgent } from "./sales-agent.js";
import { deterministicRuntime } from "../core/runtime.js";

function make(): SalesAgent {
  return new SalesAgent({ runtime: deterministicRuntime() });
}

const account = { brand: { domain: "acme.com" }, operator: "agency.com", billing: "operator" as const };

describe("SalesAgent accounts", () => {
  it("provisions accounts as active and lists them", () => {
    const agent = make();
    const { accounts } = agent.syncAccounts({ accounts: [{ brand: { domain: "acme.com" }, operator: "agency.com" }] });
    expect(accounts[0].status).toBe("active");
    expect(accounts[0].account_id).toMatch(/^acct_/);
    expect(agent.listAccounts().accounts).toHaveLength(1);
    expect(agent.listAccounts({ status: "rejected" }).accounts).toHaveLength(0);
  });

  it("is stable on re-sync (same account_id, keeps created_at)", () => {
    const agent = make();
    const a = agent.syncAccounts({ accounts: [{ brand: { domain: "acme.com" }, operator: "agency.com" }] });
    const b = agent.syncAccounts({ accounts: [{ brand: { domain: "acme.com" }, operator: "agency.com" }] });
    expect(b.accounts[0].account_id).toBe(a.accounts[0].account_id);
    expect(b.accounts[0].created_at).toBe(a.accounts[0].created_at);
    expect(agent.listAccounts().accounts).toHaveLength(1);
  });
});

describe("SalesAgent catalogs", () => {
  it("syncs a catalog feed", () => {
    const agent = make();
    const { catalogs } = agent.syncCatalogs({
      account,
      catalogs: [{ catalog_id: "acme_products", name: "Acme Products", type: "product", url: "https://acme.com/feed.json", feed_format: "shopify", update_frequency: "daily" }],
    });
    expect(catalogs[0].status).toBe("synced");
    expect(agent.store.catalogs.size).toBe(1);
  });
});

describe("SalesAgent audiences", () => {
  it("syncs an audience with a deterministic match rate", () => {
    const agent = make();
    const { audiences } = agent.syncAudiences({
      account,
      audiences: [{ audience_id: "acme_customers", name: "Existing customers", audience_type: "suppression" }],
    });
    expect(audiences[0].status).toBe("ready");
    expect(audiences[0].match_rate).toBeGreaterThanOrEqual(0.55);
    expect(audiences[0].match_rate).toBeLessThanOrEqual(0.95);
    // deterministic: same id → same rate
    const again = make().syncAudiences({ account, audiences: [{ audience_id: "acme_customers", name: "x" }] });
    expect(again.audiences[0].match_rate).toBe(audiences[0].match_rate);
  });
});

describe("SalesAgent conversion tracking", () => {
  it("requires an event source before logging events", () => {
    const agent = make();
    expect(() =>
      agent.logEvent({ event_source_id: "missing", events: [{ event_id: "e1", event_type: "purchase", event_time: "2026-06-01T00:00:00Z" }] }),
    ).toThrow(/not found/);
  });

  it("configures an event source and ingests events", () => {
    const agent = make();
    agent.syncEventSources({ event_sources: [{ event_source_id: "acme_pixel", type: "pixel" }] });
    const r1 = agent.logEvent({
      event_source_id: "acme_pixel",
      events: [{ event_id: "e1", event_type: "purchase", event_time: "2026-06-01T00:00:00Z", custom_data: { value: 149.99 } }],
    });
    expect(r1.accepted).toBe(1);
    const r2 = agent.logEvent({
      event_source_id: "acme_pixel",
      events: [{ event_id: "e2", event_type: "lead", event_time: "2026-06-02T00:00:00Z" }],
    });
    expect(r2.total_events).toBe(2);
  });
});
