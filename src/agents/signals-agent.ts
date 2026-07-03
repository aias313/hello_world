/**
 * Signals agent — third-party targeting data discovery & activation.
 *
 * Implements the AdCP Signals tasks: get_signals (natural-language segment
 * discovery) and activate_signal (deploy a segment to a platform destination).
 */
import {
  AdcpError,
  parseOrThrow,
  Store,
  type Runtime,
  systemRuntime,
  SEED_SIGNALS,
} from "../core/index.js";
import {
  ActivateSignalRequest,
  GetSignalsRequest,
  type Signal,
} from "../core/schemas.js";

export interface Activation {
  activation_id: string;
  signal_agent_segment_id: string;
  platform: string;
  status: "active";
  activated_at: string;
}

export interface SignalsAgentOptions {
  runtime?: Runtime;
  signals?: Signal[];
}

export class SignalsAgent {
  readonly store = new Store();
  private readonly rt: Runtime;
  private readonly activations = new Map<string, Activation>();
  private readonly idempotency = new Map<string, string>();

  constructor(opts: SignalsAgentOptions = {}) {
    this.rt = opts.runtime ?? systemRuntime();
    this.store.seedSignals(opts.signals ?? SEED_SIGNALS);
  }

  /** get_signals — discover targeting segments matching a natural-language spec. */
  getSignals(input: unknown): { signals: Array<Signal & { relevance: number }> } {
    const req = parseOrThrow(GetSignalsRequest, input, "get_signals request");
    const terms = req.signal_spec
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2);

    let signals = this.store.listSignals();
    if (req.max_price) signals = signals.filter((s) => s.pricing.amount <= req.max_price!);

    const ranked = signals
      .map((s) => ({ ...s, relevance: relevance(s, terms) }))
      .sort((a, b) => b.relevance - a.relevance);

    // Return all priced-eligible signals, ranked; relevance 0 still allowed so
    // buyers can see the full catalog, best matches first.
    return { signals: ranked };
  }

  /** activate_signal — deploy a segment onto a destination platform. */
  activateSignal(input: unknown): { activation: Activation; replayed: boolean } {
    const req = parseOrThrow(ActivateSignalRequest, input, "activate_signal request");
    const signal = this.store.signals.get(req.signal_agent_segment_id);
    if (!signal) throw AdcpError.notFound(`Signal ${req.signal_agent_segment_id}`);
    if (req.destinations.length === 0) throw AdcpError.invalid("At least one destination required");

    if (req.idempotency_key && this.idempotency.has(req.idempotency_key)) {
      return { activation: this.activations.get(this.idempotency.get(req.idempotency_key)!)!, replayed: true };
    }

    const dest = req.destinations[0];
    const activation: Activation = {
      activation_id: this.rt.ids.next("act"),
      signal_agent_segment_id: signal.signal_agent_segment_id,
      platform: dest.platform,
      status: "active",
      activated_at: this.rt.clock.isoNow(),
    };
    this.activations.set(activation.activation_id, activation);
    if (req.idempotency_key) this.idempotency.set(req.idempotency_key, activation.activation_id);
    return { activation, replayed: false };
  }

  listActivations(): Activation[] {
    return [...this.activations.values()];
  }
}

function relevance(s: Signal, terms: string[]): number {
  const hay = [s.name, s.description, ...s.keywords].join(" ").toLowerCase();
  let score = 0;
  for (const t of terms) if (hay.includes(t)) score += 1;
  return score;
}
