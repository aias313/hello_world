/**
 * Orchestrator — the buyer-side coordinator that runs a full AdCP campaign
 * lifecycle across specialized agents:
 *
 *   discover inventory (sales) → discover + activate data (signals)
 *   → build creative (creative) → govern (governance) → sync creative (sales)
 *   → execute buy (sales) → monitor delivery (sales) → feedback (sales)
 *
 * It is transport-agnostic: it only depends on the client interfaces, so the
 * same orchestration runs against in-process agents or remote HTTP agents.
 */
import { type Runtime, systemRuntime } from "../core/index.js";
import type {
  Account,
  Brand,
  Channel,
  FormatId,
  MediaBuy,
  Product,
} from "../core/schemas.js";
import type { SalesClient, CreativeClient, SignalsClient, DeliveryReport } from "./clients.js";
import {
  GovernanceAgent,
  type GovernanceDecision,
} from "./governance.js";

export interface SellerConnection {
  name: string;
  agentUrl: string;
  sales: SalesClient;
}

export interface CampaignBrief {
  name: string;
  brief: string;
  brand: Brand;
  account: Account;
  total_budget: number;
  currency?: string;
  channels?: Channel[];
  start_time: string;
  end_time: string;
  /** Max products to select across all sellers. */
  max_products?: number;
  /** Natural-language spec for third-party signals to layer on. */
  signal_spec?: string;
}

export interface CampaignEvent {
  step: string;
  message: string;
  data?: unknown;
}

export interface SelectedProduct {
  seller: SellerConnection;
  product: Product;
  budget: number;
}

export interface CampaignResult {
  name: string;
  plan_id: string;
  governance: GovernanceDecision;
  selected: Array<{ seller: string; product_id: string; budget: number }>;
  activated_signals: string[];
  creative_set_id?: string;
  media_buys: Array<{ seller: string; media_buy: MediaBuy }>;
  events: CampaignEvent[];
  status: "executed" | "denied" | "no_inventory";
}

export interface OrchestratorOptions {
  sellers: SellerConnection[];
  creative: CreativeClient;
  signals?: SignalsClient;
  governance: GovernanceAgent;
  runtime?: Runtime;
  /** Optional live event sink (e.g. for CLI streaming). */
  onEvent?: (e: CampaignEvent) => void;
}

export class Orchestrator {
  private readonly rt: Runtime;
  constructor(private readonly opts: OrchestratorOptions) {
    this.rt = opts.runtime ?? systemRuntime();
  }

  async runCampaign(brief: CampaignBrief): Promise<CampaignResult> {
    const events: CampaignEvent[] = [];
    const emit = (step: string, message: string, data?: unknown) => {
      const e = { step, message, data };
      events.push(e);
      this.opts.onEvent?.(e);
    };
    const planId = this.rt.ids.next("plan");
    const currency = brief.currency ?? "USD";

    /* 1. Discovery — fan the brief out to every seller. */
    emit("discover", `Sending brief to ${this.opts.sellers.length} seller(s)`);
    const candidates: Array<{ seller: SellerConnection; product: Product }> = [];
    for (const seller of this.opts.sellers) {
      const { products } = await seller.sales.getProducts({
        buying_mode: "brief",
        brief: brief.brief,
        brand: brief.brand,
        channels: brief.channels,
        max_budget: brief.total_budget,
      });
      emit("discover", `${seller.name} returned ${products.length} product(s)`, {
        products: products.map((p) => p.product_id),
      });
      for (const product of products) candidates.push({ seller, product });
    }

    if (candidates.length === 0) {
      emit("discover", "No inventory matched the brief");
      return {
        name: brief.name,
        plan_id: planId,
        governance: { result: "denied", plan_id: planId, reason: "no inventory" },
        selected: [],
        activated_signals: [],
        media_buys: [],
        events,
        status: "no_inventory",
      };
    }

    /* 2. Selection + budget allocation. */
    const selected = allocate(candidates, brief.total_budget, brief.max_products ?? 3);
    emit(
      "select",
      `Selected ${selected.length} product(s)`,
      selected.map((s) => ({ seller: s.seller.name, product: s.product.product_id, budget: s.budget })),
    );

    /* 3. Signals discovery + activation (optional). */
    const activatedSignals: string[] = [];
    if (this.opts.signals && (brief.signal_spec || brief.brief)) {
      const { signals } = await this.opts.signals.getSignals({
        signal_spec: brief.signal_spec ?? brief.brief,
      });
      const top = signals.filter((s) => s.relevance > 0).slice(0, 1);
      emit("signals", `Discovered ${signals.length} signal(s), activating ${top.length}`, {
        candidates: signals.map((s) => s.signal_agent_segment_id),
      });
      for (const sig of top) {
        for (const seller of new Set(selected.map((s) => s.seller.name))) {
          const { activation } = await this.opts.signals.activateSignal({
            signal_agent_segment_id: sig.signal_agent_segment_id,
            destinations: [{ type: "platform", platform: seller }],
          });
          activatedSignals.push(activation.signal_agent_segment_id);
        }
      }
    }
    const uniqueSignals = [...new Set(activatedSignals)];

    /* 4. Creative — build one set covering every required format. */
    const formatIds = uniqueFormats(selected.map((s) => s.product));
    emit("creative", `Building creative for ${formatIds.length} format(s)`, {
      formats: formatIds.map((f) => f.id),
    });
    const built = await this.opts.creative.buildCreative({
      message: brief.brief,
      brand: brief.brand,
      target_format_ids: formatIds,
    });
    emit("creative", `Built creative set ${built.creative_set_id} (${built.creatives.length} creatives)`);

    /* 5. Governance — check the whole plan before spending. */
    const decision = this.opts.governance.check({
      plan_id: planId,
      tool: "create_media_buy",
      caller: brief.account.operator,
      payload: {
        total_budget: sumBy(selected, (s) => s.budget),
        channels: [...new Set(selected.flatMap((s) => s.product.channels))],
        brand: brief.brand,
        brief: brief.brief,
      },
    });
    emit("govern", `Governance ${decision.result}`, decision);
    if (decision.result === "denied") {
      return {
        name: brief.name,
        plan_id: planId,
        governance: decision,
        selected: selected.map((s) => ({ seller: s.seller.name, product_id: s.product.product_id, budget: s.budget })),
        activated_signals: uniqueSignals,
        creative_set_id: built.creative_set_id,
        media_buys: [],
        events,
        status: "denied",
      };
    }

    /* 6 + 7. Sync creative to each seller and execute a media buy per seller. */
    const mediaBuys: Array<{ seller: string; media_buy: MediaBuy }> = [];
    const bySeller = groupBySeller(selected);
    for (const [sellerName, group] of bySeller) {
      const seller = group[0].seller;

      // Establish the commercial relationship before spending.
      const { accounts } = await seller.sales.syncAccounts({
        accounts: [
          { brand: brief.account.brand, operator: brief.account.operator, billing: brief.account.billing },
        ],
      });
      emit("sync_accounts", `${sellerName}: account ${accounts[0].account_id} ${accounts[0].status}`);

      // Sync the built creatives into the seller's library (re-reviewed there).
      const syncPayload = {
        account: brief.account,
        creatives: built.creatives.map((c) => ({
          creative_id: c.creative_id,
          name: c.name,
          format_id: c.format_id,
          assets: c.assets,
          brand: c.brand ?? brief.brand,
        })),
      };
      const synced = await seller.sales.syncCreatives(syncPayload);
      const approved = new Set(synced.creatives.filter((c) => c.status === "approved").map((c) => c.creative_id));
      emit("sync_creatives", `${sellerName}: ${approved.size}/${synced.creatives.length} creatives approved`);

      // Build packages: assign approved creatives whose format the product supports.
      const packages = group.map((sel) => {
        const supported = new Set(sel.product.format_ids.map((f) => f.id));
        const creativeIds = built.creatives
          .filter((c) => supported.has(c.format_id.id) && approved.has(c.creative_id))
          .map((c) => c.creative_id);
        return {
          product_id: sel.product.product_id,
          budget: sel.budget,
          pricing_option_id: sel.product.pricing_options[0].pricing_option_id,
          creative_ids: creativeIds,
          signal_ids: uniqueSignals,
        };
      });

      const { media_buy, replayed } = await seller.sales.createMediaBuy({
        idempotency_key: `${planId}:${sellerName}`,
        buyer_ref: `${brief.name}:${sellerName}`,
        account: brief.account,
        brand: brief.brand,
        start_time: brief.start_time,
        end_time: brief.end_time,
        packages,
      });
      emit("create_media_buy", `${sellerName}: created ${media_buy.media_buy_id} (${media_buy.status})${replayed ? " [replayed]" : ""}`, {
        media_buy_id: media_buy.media_buy_id,
        total_budget: media_buy.total_budget,
        currency,
      });
      mediaBuys.push({ seller: sellerName, media_buy });
    }

    return {
      name: brief.name,
      plan_id: planId,
      governance: decision,
      selected: selected.map((s) => ({ seller: s.seller.name, product_id: s.product.product_id, budget: s.budget })),
      activated_signals: uniqueSignals,
      creative_set_id: built.creative_set_id,
      media_buys: mediaBuys,
      events,
      status: "executed",
    };
  }

  /** Pull a consolidated delivery report across every media buy in a result. */
  async collectDelivery(result: CampaignResult): Promise<DeliveryReport[]> {
    const reports: DeliveryReport[] = [];
    for (const { seller, media_buy } of result.media_buys) {
      const conn = this.opts.sellers.find((s) => s.name === seller)!;
      reports.push(await conn.sales.getMediaBuyDelivery({ media_buy_id: media_buy.media_buy_id }));
    }
    return reports;
  }

  /**
   * Record downstream conversions for attribution: configure an event source on
   * each seller and log the marketing events against it. Returns total accepted.
   */
  async recordConversions(
    result: CampaignResult,
    events: Array<{
      event_id: string;
      event_type: "purchase" | "lead" | "sign_up" | "add_to_cart" | "page_view" | "custom";
      event_time: string;
      action_source?: "website" | "app" | "physical_store" | "offline";
      custom_data?: Record<string, unknown>;
    }>,
  ): Promise<number> {
    let accepted = 0;
    const sourceId = `${result.name}_pixel`;
    for (const { seller } of result.media_buys) {
      const conn = this.opts.sellers.find((s) => s.name === seller)!;
      await conn.sales.syncEventSources({
        event_sources: [{ event_source_id: sourceId, type: "pixel", name: `${result.name} website pixel` }],
      });
      const res = await conn.sales.logEvent({ event_source_id: sourceId, events });
      accepted += res.accepted;
    }
    return accepted;
  }

  /** Submit performance feedback for each media buy (closes the optimization loop). */
  async sendFeedback(result: CampaignResult, performanceIndex: number): Promise<void> {
    for (const { seller, media_buy } of result.media_buys) {
      const conn = this.opts.sellers.find((s) => s.name === seller)!;
      await conn.sales.providePerformanceFeedback({
        media_buy_id: media_buy.media_buy_id,
        performance_index: performanceIndex,
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Allocation & helpers                                                */
/* ------------------------------------------------------------------ */

/**
 * Choose up to `maxProducts` best candidates (sellers pre-rank, so first wins)
 * and split the total budget across them, respecting each product's min_spend.
 */
export function allocate(
  candidates: Array<{ seller: SellerConnection; product: Product }>,
  total: number,
  maxProducts: number,
): SelectedProduct[] {
  // Dedupe by product_id keeping first (highest-ranked) occurrence.
  const seen = new Set<string>();
  const pool = candidates.filter((c) => {
    if (seen.has(c.product.product_id)) return false;
    seen.add(c.product.product_id);
    return true;
  });

  // Greedily pick products whose min_spend can be satisfied.
  const chosen: Array<{ seller: SellerConnection; product: Product }> = [];
  for (const c of pool) {
    if (chosen.length >= maxProducts) break;
    chosen.push(c);
  }
  if (chosen.length === 0) return [];

  // Even split, then lift each to its min_spend, then renormalize down to total.
  let budgets = chosen.map(() => total / chosen.length);
  budgets = budgets.map((b, i) => Math.max(b, minSpend(chosen[i].product)));
  const overspend = budgets.reduce((s, b) => s + b, 0);
  if (overspend > total) {
    // Drop the lowest-ranked products until the remaining set fits.
    while (chosen.length > 1) {
      const minTotal = chosen.reduce((s, c) => s + minSpend(c.product), 0);
      if (minTotal <= total) break;
      chosen.pop();
    }
    budgets = chosen.map(() => total / chosen.length);
    budgets = budgets.map((b, i) => Math.max(b, minSpend(chosen[i].product)));
  }
  // Final proportional scale, then push any rounding remainder onto the first
  // package so the allocation sums to `total` exactly.
  const scale = total / budgets.reduce((s, b) => s + b, 0);
  const scaled = budgets.map((b) => round2(b * scale));
  const drift = round2(total - scaled.reduce((s, b) => s + b, 0));
  if (scaled.length) scaled[0] = round2(scaled[0] + drift);
  return chosen.map((c, i) => ({
    seller: c.seller,
    product: c.product,
    budget: scaled[i],
  }));
}

function minSpend(p: Product): number {
  return Math.min(...p.pricing_options.map((o) => o.min_spend ?? 0));
}

function uniqueFormats(products: Product[]): FormatId[] {
  const map = new Map<string, FormatId>();
  for (const p of products) {
    for (const f of p.format_ids) {
      if (!map.has(f.id)) map.set(f.id, f);
    }
  }
  return [...map.values()];
}

function groupBySeller(selected: SelectedProduct[]): Map<string, SelectedProduct[]> {
  const m = new Map<string, SelectedProduct[]>();
  for (const s of selected) {
    const arr = m.get(s.seller.name) ?? [];
    arr.push(s);
    m.set(s.seller.name, arr);
  }
  return m;
}

function sumBy<T>(arr: T[], f: (t: T) => number): number {
  return round2(arr.reduce((s, t) => s + f(t), 0));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
