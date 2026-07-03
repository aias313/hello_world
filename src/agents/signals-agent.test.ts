import { describe, it, expect } from "vitest";
import { SignalsAgent } from "./signals-agent.js";
import { deterministicRuntime } from "../core/runtime.js";

function make(): SignalsAgent {
  return new SignalsAgent({ runtime: deterministicRuntime() });
}

describe("SignalsAgent", () => {
  it("ranks signals by spec relevance", () => {
    const agent = make();
    const { signals } = agent.getSignals({ signal_spec: "outdoor recreation hiking near sporting goods" });
    expect(signals[0].relevance).toBeGreaterThan(0);
    expect(signals[0].signal_agent_segment_id).toBe("meridian_outdoor_rec_25_45");
  });

  it("filters by max_price", () => {
    const agent = make();
    const { signals } = agent.getSignals({ signal_spec: "sports", max_price: 1.2 });
    expect(signals.every((s) => s.pricing.amount <= 1.2)).toBe(true);
  });

  it("activates a signal and is idempotent", () => {
    const agent = make();
    const req = {
      idempotency_key: "a1",
      signal_agent_segment_id: "meridian_ctv_sports_viewers",
      destinations: [{ type: "platform" as const, platform: "streamhaus" }],
    };
    const a = agent.activateSignal(req);
    const b = agent.activateSignal(req);
    expect(a.activation.status).toBe("active");
    expect(b.replayed).toBe(true);
    expect(b.activation.activation_id).toBe(a.activation.activation_id);
    expect(agent.listActivations()).toHaveLength(1);
  });

  it("throws for unknown signal or no destinations", () => {
    const agent = make();
    expect(() =>
      agent.activateSignal({ signal_agent_segment_id: "nope", destinations: [{ type: "platform", platform: "x" }] }),
    ).toThrow(/not found/);
    expect(() =>
      agent.activateSignal({ signal_agent_segment_id: "meridian_ctv_sports_viewers", destinations: [] }),
    ).toThrow();
  });
});
