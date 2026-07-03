/**
 * Suite factory — wires a complete AdCP agent suite (sales + creative +
 * signals + governance + orchestrator) sharing a single runtime.
 *
 * This is the high-level entrypoint used by the CLI demo and the test suite.
 */
import { SalesAgent } from "./agents/sales-agent.js";
import { CreativeAgent } from "./agents/creative-agent.js";
import { SignalsAgent } from "./agents/signals-agent.js";
import {
  GovernanceAgent,
  type GovernancePolicy,
  type HumanApprover,
} from "./buyer/governance.js";
import {
  Orchestrator,
  type SellerConnection,
  type OrchestratorOptions,
} from "./buyer/orchestrator.js";
import { inProcSales, inProcCreative, inProcSignals } from "./buyer/clients.js";
import {
  systemRuntime,
  deterministicRuntime,
  type Runtime,
  DEFAULT_AGENT_URL,
} from "./core/index.js";

export interface SuiteOptions {
  deterministic?: boolean;
  startTime?: string;
  policy?: Partial<GovernancePolicy>;
  approver?: HumanApprover;
  onEvent?: OrchestratorOptions["onEvent"];
}

export interface Suite {
  runtime: Runtime;
  sales: SalesAgent;
  creative: CreativeAgent;
  signals: SignalsAgent;
  governance: GovernanceAgent;
  orchestrator: Orchestrator;
  sellers: SellerConnection[];
}

export const DEFAULT_POLICY: GovernancePolicy = {
  autoApproveUnder: 20000,
  allowedChannels: ["ctv", "olv", "display", "audio", "native", "social", "dooh", "retail_media"],
  blockedKeywords: ["gambling", "tobacco", "hate"],
};

/** A default human approver that green-lights escalations with sensible caps. */
export const AUTO_APPROVER: HumanApprover = {
  review: (_req, _reason) => ["Weekly spend cap enforced", "Reviewed by campaign ops"],
};

export function createSuite(opts: SuiteOptions = {}): Suite {
  const runtime = opts.deterministic
    ? deterministicRuntime(opts.startTime)
    : systemRuntime();

  const sales = new SalesAgent({ runtime, agentUrl: DEFAULT_AGENT_URL });
  const creative = new CreativeAgent({ runtime });
  const signals = new SignalsAgent({ runtime });

  const policy: GovernancePolicy = { ...DEFAULT_POLICY, ...opts.policy };
  const governance = new GovernanceAgent(policy, opts.approver ?? AUTO_APPROVER, runtime);

  const sellers: SellerConnection[] = [
    { name: "StreamHaus", agentUrl: sales.agentUrl, sales: inProcSales(sales) },
  ];

  const orchestrator = new Orchestrator({
    sellers,
    creative: inProcCreative(creative),
    signals: inProcSignals(signals),
    governance,
    runtime,
    onEvent: opts.onEvent,
  });

  return { runtime, sales, creative, signals, governance, orchestrator, sellers };
}
