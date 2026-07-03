/**
 * Governance agent — the trust layer that sits between the orchestrator and
 * spend. Implements check_governance (policy evaluation with human-escalation)
 * and an append-only audit log per plan.
 */
import { type Runtime, systemRuntime } from "../core/index.js";

export interface GovernancePolicy {
  /** Spend at or above this threshold escalates to a human approver. */
  autoApproveUnder: number;
  /** Channels the buyer is permitted to run on. */
  allowedChannels: string[];
  /** Brand-safety: domains/keywords that must never appear. */
  blockedKeywords: string[];
  /** Optional weekly spend cap applied as an approval condition. */
  weeklySpendCap?: number;
}

export interface GovernanceRequest {
  plan_id: string;
  tool: string;
  caller: string;
  payload: {
    total_budget: number;
    channels: string[];
    brand: { domain: string };
    brief?: string;
  };
}

export type GovernanceDecision =
  | { result: "approved"; plan_id: string; conditions: string[] }
  | { result: "escalated"; plan_id: string; reason: string; conditions: string[] }
  | { result: "denied"; plan_id: string; reason: string };

export interface AuditEntry {
  timestamp: string;
  actor: string;
  action: string;
  details?: Record<string, unknown>;
}

export interface HumanApprover {
  /** Return conditions to attach (approve) or null to reject an escalation. */
  review(req: GovernanceRequest, reason: string): string[] | null;
}

export class GovernanceAgent {
  private readonly rt: Runtime;
  private readonly logs = new Map<string, AuditEntry[]>();

  constructor(
    private readonly policy: GovernancePolicy,
    private readonly approver?: HumanApprover,
    rt?: Runtime,
  ) {
    this.rt = rt ?? systemRuntime();
  }

  /** check_governance — evaluate a plan against policy before execution. */
  check(req: GovernanceRequest): GovernanceDecision {
    this.log(req.plan_id, "buyer_agent", "submit_plan", {
      budget: req.payload.total_budget,
      channels: req.payload.channels,
      tool: req.tool,
    });

    // Hard policy failures → denied.
    const badChannel = req.payload.channels.find((c) => !this.policy.allowedChannels.includes(c));
    if (badChannel) {
      const reason = `Channel "${badChannel}" is not permitted by policy`;
      this.log(req.plan_id, "governance_agent", "deny", { reason });
      return { result: "denied", plan_id: req.plan_id, reason };
    }
    const brief = (req.payload.brief ?? "").toLowerCase();
    const badWord = this.policy.blockedKeywords.find((k) => brief.includes(k.toLowerCase()));
    if (badWord) {
      const reason = `Brief violates brand-safety policy (matched "${badWord}")`;
      this.log(req.plan_id, "governance_agent", "deny", { reason });
      return { result: "denied", plan_id: req.plan_id, reason };
    }

    const baseConditions: string[] = [];
    if (this.policy.weeklySpendCap) {
      baseConditions.push(`Weekly spend cap of ${this.policy.weeklySpendCap}`);
    }

    // Budget over threshold → escalate to a human.
    if (req.payload.total_budget >= this.policy.autoApproveUnder) {
      const reason = `Budget ${req.payload.total_budget} exceeds auto-approval threshold (${this.policy.autoApproveUnder})`;
      this.log(req.plan_id, "governance_agent", "escalate", { reason });
      const conditions = this.approver?.review(req, reason) ?? null;
      if (conditions === null) {
        const denyReason = `${reason}; human approver rejected`;
        this.log(req.plan_id, "human_approver", "reject", { reason: denyReason });
        return { result: "denied", plan_id: req.plan_id, reason: denyReason };
      }
      const all = [...baseConditions, ...conditions];
      this.log(req.plan_id, "human_approver", "approve_with_conditions", { conditions: all });
      return { result: "escalated", plan_id: req.plan_id, reason, conditions: all };
    }

    this.log(req.plan_id, "governance_agent", "auto_approve", { conditions: baseConditions });
    return { result: "approved", plan_id: req.plan_id, conditions: baseConditions };
  }

  /** get_plan_audit_logs — the full decision trail for a plan. */
  getAuditLog(planId: string): AuditEntry[] {
    return this.logs.get(planId) ?? [];
  }

  private log(planId: string, actor: string, action: string, details?: Record<string, unknown>): void {
    const entry: AuditEntry = { timestamp: this.rt.clock.isoNow(), actor, action, details };
    const arr = this.logs.get(planId) ?? [];
    arr.push(entry);
    this.logs.set(planId, arr);
  }
}
