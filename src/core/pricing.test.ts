import { describe, it, expect } from "vitest";
import { estimateImpressions, simulateDelivery } from "./pricing.js";
import { parseOrThrow, AdcpError } from "./errors.js";
import { CreateMediaBuyRequest } from "./schemas.js";

describe("pricing math", () => {
  it("estimates CPM impressions", () => {
    expect(estimateImpressions(10000, { pricing_option_id: "o", model: "cpm", price: 10, currency: "USD" })).toBe(1_000_000);
  });

  it("simulated delivery never exceeds budget and grows with progress", () => {
    const opt = { budget: 10000, price: 10, model: "cpm" as const, seed: 0.4 };
    const mid = simulateDelivery({ ...opt, progress: 0.5 });
    const end = simulateDelivery({ ...opt, progress: 1 });
    expect(mid.spend).toBeLessThanOrEqual(10000);
    expect(end.spend).toBeLessThanOrEqual(10000);
    expect(end.impressions).toBeGreaterThanOrEqual(mid.impressions);
  });

  it("cpc simulation produces clicks", () => {
    const r = simulateDelivery({ budget: 1000, price: 0.5, model: "cpc", progress: 1, seed: 0.2 });
    expect(r.clicks).toBeGreaterThan(0);
  });
});

describe("parseOrThrow", () => {
  it("throws AdcpError with issue details on invalid input", () => {
    try {
      parseOrThrow(CreateMediaBuyRequest, { account: {}, packages: [] }, "create");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AdcpError);
      expect((e as AdcpError).code).toBe("invalid_request");
      expect(Array.isArray((e as AdcpError).details)).toBe(true);
    }
  });
});
