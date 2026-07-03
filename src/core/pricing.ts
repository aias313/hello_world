/**
 * Pricing math + a small delivery simulation used by the sales agent to make
 * campaigns "run" over time so buyers can poll realistic delivery numbers.
 */
import type { PricingModel, PricingOption } from "./schemas.js";

/** Estimate deliverable impressions for a budget under a pricing option. */
export function estimateImpressions(budget: number, opt: PricingOption): number {
  switch (opt.model) {
    case "cpm":
      return Math.floor((budget / opt.price) * 1000);
    case "cpcv":
      // completed-view priced; assume ~85% completion for impression estimate
      return Math.floor(budget / opt.price / 0.85);
    case "cpc":
      // clicks priced; back into impressions via a nominal 0.4% CTR
      return Math.floor((budget / opt.price) / 0.004);
    case "flat_rate":
      return 0; // flat-rate delivery is defined by the product forecast, not budget
  }
}

export interface SimInputs {
  budget: number;
  price: number;
  model: PricingModel;
  /** 0..1 fraction of the flight elapsed. */
  progress: number;
  /** deterministic per-package jitter seed (0..1). */
  seed: number;
}

export interface SimResult {
  impressions: number;
  clicks: number;
  completed_views: number;
  spend: number;
}

/**
 * Simulate cumulative delivery at a given point in a flight. Pacing is roughly
 * even with a mild deterministic wobble so numbers look organic but stay
 * reproducible (no randomness at call time).
 */
export function simulateDelivery(input: SimInputs): SimResult {
  const p = Math.max(0, Math.min(1, input.progress));
  // deterministic pacing wobble in [0.92, 1.08]
  const wobble = 0.92 + ((Math.sin(input.seed * 12.9898) + 1) / 2) * 0.16;
  const spend = round2(input.budget * p * wobble > input.budget ? input.budget : input.budget * p * wobble);

  let impressions = 0;
  let completed_views = 0;
  const ctr = 0.004 + (input.seed % 1) * 0.003; // 0.4%–0.7%

  switch (input.model) {
    case "cpm":
      impressions = Math.floor((spend / input.price) * 1000);
      completed_views = Math.floor(impressions * 0.85);
      break;
    case "cpcv":
      completed_views = Math.floor(spend / input.price);
      impressions = Math.floor(completed_views / 0.85);
      break;
    case "cpc": {
      const clicks = Math.floor(spend / input.price);
      impressions = Math.floor(clicks / ctr);
      completed_views = 0;
      return { impressions, clicks, completed_views, spend };
    }
    case "flat_rate":
      impressions = 0;
      break;
  }
  const clicks = Math.floor(impressions * ctr);
  return { impressions, clicks, completed_views, spend };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
