import { describe, it, expect, beforeEach } from "vitest";
import { SalesAgent } from "./sales-agent.js";
import { deterministicRuntime, FixedClock } from "../core/runtime.js";
import type { Runtime } from "../core/runtime.js";

function make(): { agent: SalesAgent; rt: Runtime; clock: FixedClock } {
  const rt = deterministicRuntime("2026-03-01T00:00:00.000Z");
  const agent = new SalesAgent({ runtime: rt });
  return { agent, rt, clock: rt.clock as FixedClock };
}

const flight = {
  start_time: "2026-04-01T00:00:00.000Z",
  end_time: "2026-06-30T00:00:00.000Z",
};
const account = { brand: { domain: "acme.com" }, operator: "agency.com", billing: "operator" as const };
const brand = { domain: "acme.com" };

describe("SalesAgent discovery", () => {
  it("ranks products by brief relevance", () => {
    const { agent } = make();
    const { products } = agent.getProducts({ buying_mode: "brief", brief: "premium sports ctv video" });
    expect(products[0].product_id).toBe("streamhaus_sports_ctv");
  });

  it("filters by channel", () => {
    const { agent } = make();
    const { products } = agent.getProducts({ buying_mode: "brief", channels: ["audio"] });
    expect(products.every((p) => p.channels.includes("audio"))).toBe(true);
    expect(products.length).toBe(1);
  });

  it("falls back to full catalog when nothing matches the brief", () => {
    const { agent } = make();
    const { products } = agent.getProducts({ buying_mode: "brief", brief: "zzz nonsense query xyz" });
    expect(products.length).toBe(4);
  });

  it("honors refine removals", () => {
    const { agent } = make();
    const { products } = agent.getProducts({
      buying_mode: "refine",
      refine: [{ scope: "product", product_id: "streamhaus_display_ros", action: "remove", ask: "drop display" }],
    });
    expect(products.find((p) => p.product_id === "streamhaus_display_ros")).toBeUndefined();
  });
});

describe("SalesAgent create/update media buy", () => {
  it("creates a media buy and computes total budget", () => {
    const { agent } = make();
    const { media_buy } = agent.createMediaBuy({
      account,
      brand,
      ...flight,
      packages: [{ product_id: "streamhaus_display_ros", budget: 10000 }],
    });
    expect(media_buy.media_buy_id).toMatch(/^mb_/);
    expect(media_buy.total_budget).toBe(10000);
    expect(media_buy.packages).toHaveLength(1);
    expect(media_buy.packages[0].pricing_model).toBe("cpm");
  });

  it("is idempotent on idempotency_key", () => {
    const { agent } = make();
    const req = {
      idempotency_key: "abc",
      account,
      brand,
      ...flight,
      packages: [{ product_id: "streamhaus_display_ros", budget: 10000 }],
    };
    const a = agent.createMediaBuy(req);
    const b = agent.createMediaBuy(req);
    expect(b.replayed).toBe(true);
    expect(b.media_buy.media_buy_id).toBe(a.media_buy.media_buy_id);
  });

  it("rejects budget below min_spend", () => {
    const { agent } = make();
    expect(() =>
      agent.createMediaBuy({
        account,
        brand,
        ...flight,
        packages: [{ product_id: "streamhaus_sports_ctv", budget: 100 }],
      }),
    ).toThrow(/min_spend/);
  });

  it("rejects unknown product", () => {
    const { agent } = make();
    expect(() =>
      agent.createMediaBuy({ account, brand, ...flight, packages: [{ product_id: "nope", budget: 10000 }] }),
    ).toThrow(/not found/);
  });

  it("rejects end before start", () => {
    const { agent } = make();
    expect(() =>
      agent.createMediaBuy({
        account,
        brand,
        start_time: flight.end_time,
        end_time: flight.start_time,
        packages: [{ product_id: "streamhaus_display_ros", budget: 10000 }],
      }),
    ).toThrow(/after start_time/);
  });

  it("updates package budget and recomputes total", () => {
    const { agent } = make();
    const { media_buy } = agent.createMediaBuy({
      account,
      brand,
      ...flight,
      packages: [{ product_id: "streamhaus_display_ros", budget: 10000 }],
    });
    const pkgId = media_buy.packages[0].package_id;
    const upd = agent.updateMediaBuy({
      media_buy_id: media_buy.media_buy_id,
      package_updates: [{ package_id: pkgId, budget: 25000 }],
    });
    expect(upd.media_buy.total_budget).toBe(25000);
  });
});

describe("SalesAgent delivery simulation", () => {
  it("delivers nothing before flight, partial mid, ~full at end", () => {
    const { agent, clock } = make();
    const { media_buy } = agent.createMediaBuy({
      account,
      brand,
      ...flight,
      packages: [{ product_id: "streamhaus_display_ros", budget: 10000 }],
    });
    const id = media_buy.media_buy_id;

    // before flight
    let d = agent.getMediaBuyDelivery({ media_buy_id: id });
    expect(d.status).toBe("pending_start");
    expect(d.impressions).toBe(0);

    // mid flight
    clock.set("2026-05-16T00:00:00.000Z");
    d = agent.getMediaBuyDelivery({ media_buy_id: id });
    expect(d.status).toBe("active");
    expect(d.impressions).toBeGreaterThan(0);
    expect(d.spend.amount).toBeLessThan(10000);

    // end
    clock.set("2026-07-01T00:00:00.000Z");
    d = agent.getMediaBuyDelivery({ media_buy_id: id });
    expect(d.status).toBe("completed");
    expect(d.spend.amount).toBeGreaterThan(8000);
    expect(d.spend.amount).toBeLessThanOrEqual(10000);
  });

  it("delivery is monotonic across the flight", () => {
    const { agent, clock } = make();
    const { media_buy } = agent.createMediaBuy({
      account,
      brand,
      ...flight,
      packages: [{ product_id: "streamhaus_sports_ctv", budget: 20000 }],
    });
    const id = media_buy.media_buy_id;
    clock.set("2026-04-15T00:00:00.000Z");
    const a = agent.getMediaBuyDelivery({ media_buy_id: id }).impressions;
    clock.set("2026-05-15T00:00:00.000Z");
    const b = agent.getMediaBuyDelivery({ media_buy_id: id }).impressions;
    clock.set("2026-06-15T00:00:00.000Z");
    const c = agent.getMediaBuyDelivery({ media_buy_id: id }).impressions;
    expect(b).toBeGreaterThanOrEqual(a);
    expect(c).toBeGreaterThanOrEqual(b);
  });
});

describe("SalesAgent creative review", () => {
  let agent: SalesAgent;
  beforeEach(() => {
    agent = make().agent;
  });

  it("approves a compliant display creative", () => {
    const { creatives } = agent.syncCreatives({
      creatives: [
        {
          creative_id: "c1",
          name: "Banner",
          format_id: { agent_url: "x", id: "display_300x250" },
          assets: {
            image: { asset_type: "image", url: "u", width: 300, height: 250, mime_type: "image/png", file_size_bytes: 100000 },
          },
        },
      ],
    });
    expect(creatives[0].status).toBe("approved");
  });

  it("rejects wrong dimensions", () => {
    const { creatives } = agent.syncCreatives({
      creatives: [
        {
          creative_id: "c2",
          name: "Banner",
          format_id: { agent_url: "x", id: "display_300x250" },
          assets: {
            image: { asset_type: "image", url: "u", width: 728, height: 90, mime_type: "image/png" },
          },
        },
      ],
    });
    expect(creatives[0].status).toBe("rejected");
    expect(creatives[0].status_reason).toMatch(/width/);
  });

  it("rejects oversized files and unknown formats", () => {
    const big = agent.syncCreatives({
      creatives: [
        {
          creative_id: "c3",
          name: "Huge",
          format_id: { agent_url: "x", id: "display_300x250" },
          assets: { image: { asset_type: "image", url: "u", width: 300, height: 250, file_size_bytes: 999999999, mime_type: "image/png" } },
        },
      ],
    });
    expect(big.creatives[0].status).toBe("rejected");

    const unknown = agent.syncCreatives({
      creatives: [
        { creative_id: "c4", name: "X", format_id: { agent_url: "x", id: "no_such_format" }, assets: { a: { asset_type: "image", url: "u" } } },
      ],
    });
    expect(unknown.creatives[0].status).toBe("rejected");
  });
});

describe("SalesAgent performance feedback", () => {
  it("accepts feedback for a known media buy", () => {
    const { agent } = make();
    const { media_buy } = agent.createMediaBuy({
      account,
      brand,
      ...flight,
      packages: [{ product_id: "streamhaus_display_ros", budget: 10000 }],
    });
    const r = agent.providePerformanceFeedback({ media_buy_id: media_buy.media_buy_id, performance_index: 1.2 });
    expect(r.accepted).toBe(true);
  });

  it("throws for unknown media buy", () => {
    const { agent } = make();
    expect(() => agent.providePerformanceFeedback({ media_buy_id: "nope", performance_index: 1 })).toThrow(/not found/);
  });
});
