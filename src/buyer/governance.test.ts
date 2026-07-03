import { describe, it, expect } from "vitest";
import { GovernanceAgent, type GovernancePolicy, type HumanApprover } from "./governance.js";
import { deterministicRuntime } from "../core/runtime.js";

const policy: GovernancePolicy = {
  autoApproveUnder: 20000,
  allowedChannels: ["ctv", "olv", "display"],
  blockedKeywords: ["gambling"],
  weeklySpendCap: 15000,
};

function req(over: Partial<{ budget: number; channels: string[]; brief: string }> = {}) {
  return {
    plan_id: "plan1",
    tool: "create_media_buy",
    caller: "agency.com",
    payload: {
      total_budget: over.budget ?? 10000,
      channels: over.channels ?? ["ctv"],
      brand: { domain: "acme.com" },
      brief: over.brief ?? "premium sports",
    },
  };
}

describe("GovernanceAgent", () => {
  it("auto-approves under threshold with base conditions", () => {
    const g = new GovernanceAgent(policy, undefined, deterministicRuntime());
    const d = g.check(req({ budget: 10000 }));
    expect(d.result).toBe("approved");
    if (d.result === "approved") expect(d.conditions).toContain("Weekly spend cap of 15000");
  });

  it("escalates over threshold and applies approver conditions", () => {
    const approver: HumanApprover = { review: () => ["CTV only until brand review"] };
    const g = new GovernanceAgent(policy, approver, deterministicRuntime());
    const d = g.check(req({ budget: 50000 }));
    expect(d.result).toBe("escalated");
    if (d.result === "escalated") expect(d.conditions).toContain("CTV only until brand review");
  });

  it("denies when human approver rejects an escalation", () => {
    const approver: HumanApprover = { review: () => null };
    const g = new GovernanceAgent(policy, approver, deterministicRuntime());
    const d = g.check(req({ budget: 50000 }));
    expect(d.result).toBe("denied");
  });

  it("denies disallowed channels", () => {
    const g = new GovernanceAgent(policy, undefined, deterministicRuntime());
    const d = g.check(req({ channels: ["dooh"] }));
    expect(d.result).toBe("denied");
    if (d.result === "denied") expect(d.reason).toMatch(/not permitted/);
  });

  it("denies brand-safety keyword violations", () => {
    const g = new GovernanceAgent(policy, undefined, deterministicRuntime());
    const d = g.check(req({ brief: "great gambling offers" }));
    expect(d.result).toBe("denied");
  });

  it("records an append-only audit trail", () => {
    const g = new GovernanceAgent(policy, undefined, deterministicRuntime());
    g.check(req({ budget: 5000 }));
    const log = g.getAuditLog("plan1");
    expect(log[0].action).toBe("submit_plan");
    expect(log.at(-1)?.action).toBe("auto_approve");
  });
});
