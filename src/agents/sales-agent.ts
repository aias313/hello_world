/**
 * Sales (seller) agent — the "selling" side of the suite.
 *
 * Implements the AdCP Media Buy tasks a publisher/SSP exposes: product
 * discovery, media-buy creation & updates, creative sync & approval, delivery
 * reporting, and performance feedback. State lives in an in-memory Store; time
 * and ids flow through the injected Runtime for reproducibility.
 */
import {
  AdcpError,
  parseOrThrow,
  Store,
  type Runtime,
  systemRuntime,
  simulateDelivery,
  round2,
  estimateImpressions,
  SEED_FORMATS,
  SEED_PRODUCTS,
  DEFAULT_AGENT_URL,
} from "../core/index.js";
import {
  CreateMediaBuyRequest,
  GetProductsRequest,
  SyncCreativesRequest,
  UpdateMediaBuyRequest,
  SyncAccountsRequest,
  SyncCatalogsRequest,
  SyncAudiencesRequest,
  SyncEventSourcesRequest,
  LogEventRequest,
  type AccountRecord,
  type Creative,
  type CreativeFormat,
  type MediaBuy,
  type Package,
  type PackageInput,
  type PricingOption,
  type Product,
} from "../core/schemas.js";
import type { CatalogRecord, AudienceRecord, EventSourceRecord } from "../core/store.js";

export interface SalesAgentOptions {
  agentUrl?: string;
  runtime?: Runtime;
  products?: Product[];
  formats?: CreativeFormat[];
}

export class SalesAgent {
  readonly agentUrl: string;
  readonly store = new Store();
  private readonly rt: Runtime;

  constructor(opts: SalesAgentOptions = {}) {
    this.agentUrl = opts.agentUrl ?? DEFAULT_AGENT_URL;
    this.rt = opts.runtime ?? systemRuntime();
    this.store.seedProducts(opts.products ?? SEED_PRODUCTS);
    this.store.seedFormats(opts.formats ?? SEED_FORMATS);
  }

  /* -------------------------------------------------------------- */
  /* Discovery                                                       */
  /* -------------------------------------------------------------- */

  /** get_products — natural-language inventory discovery + refine. */
  getProducts(input: unknown): { products: Product[] } {
    const req = parseOrThrow(GetProductsRequest, input, "get_products request");
    let products = this.store.listProducts();

    if (req.channels?.length) {
      products = products.filter((p) => p.channels.some((c) => req.channels!.includes(c)));
    }

    const brief = [req.brief, ...(req.refine?.map((r) => r.ask) ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (brief) {
      const terms = brief.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
      const scored = products
        .map((p) => ({ p, score: scoreProduct(p, terms) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      // If nothing matched the brief, fall back to the full catalog rather
      // than returning an empty set — sellers should always propose something.
      products = scored.length ? scored.map((x) => x.p) : products;
    }

    if (req.max_budget) {
      products = products.filter((p) =>
        p.pricing_options.some((o) => (o.min_spend ?? 0) <= req.max_budget!),
      );
    }

    // In refine mode with an explicit "remove"/product scope, honor removals.
    if (req.buying_mode === "refine" && req.refine) {
      const removed = new Set(
        req.refine
          .filter((r) => r.action === "remove" && r.product_id)
          .map((r) => r.product_id!),
      );
      if (removed.size) products = products.filter((p) => !removed.has(p.product_id));
    }

    return { products };
  }

  /** list_creative_formats — supported creative specifications. */
  listCreativeFormats(input?: { type?: string }): { formats: CreativeFormat[] } {
    let formats = this.store.listFormats();
    if (input?.type) formats = formats.filter((f) => f.type === input.type);
    return { formats };
  }

  /* -------------------------------------------------------------- */
  /* Creatives                                                       */
  /* -------------------------------------------------------------- */

  /** sync_creatives — upsert creatives into the seller's library w/ review. */
  syncCreatives(input: unknown): { creatives: Creative[] } {
    const req = parseOrThrow(SyncCreativesRequest, input, "sync_creatives request");
    const out: Creative[] = [];
    for (const c of req.creatives) {
      const format = this.store.formats.get(c.format_id.id);
      const review = format ? reviewCreative(c.assets, format) : { ok: false, reason: `Unknown format ${c.format_id.id}` };
      const existing = this.store.creatives.get(c.creative_id);
      const creative: Creative = {
        creative_id: c.creative_id,
        name: c.name,
        format_id: c.format_id,
        assets: c.assets,
        brand: c.brand,
        status: review.ok ? "approved" : "rejected",
        status_reason: review.ok ? undefined : review.reason,
        created_at: existing?.created_at ?? this.rt.clock.isoNow(),
        updated_at: this.rt.clock.isoNow(),
      };
      this.store.creatives.set(creative.creative_id, creative);
      out.push(creative);
    }
    return { creatives: out };
  }

  /** list_creatives — query the creative library. */
  listCreatives(input?: { status?: string; format_id?: string }): { creatives: Creative[] } {
    let creatives = this.store.listCreatives();
    if (input?.status) creatives = creatives.filter((c) => c.status === input.status);
    if (input?.format_id) creatives = creatives.filter((c) => c.format_id.id === input.format_id);
    return { creatives };
  }

  /* -------------------------------------------------------------- */
  /* Media buys                                                      */
  /* -------------------------------------------------------------- */

  /** create_media_buy — create a campaign from selected products. */
  createMediaBuy(input: unknown): { media_buy: MediaBuy; replayed: boolean } {
    const req = parseOrThrow(CreateMediaBuyRequest, input, "create_media_buy request");

    if (req.idempotency_key && this.store.idempotency.has(req.idempotency_key)) {
      const id = this.store.idempotency.get(req.idempotency_key)!;
      return { media_buy: this.store.mediaBuys.get(id)!, replayed: true };
    }

    if (Date.parse(req.end_time) <= Date.parse(req.start_time)) {
      throw AdcpError.invalid("end_time must be after start_time");
    }

    const packages: Package[] = req.packages.map((pkg) => this.buildPackage(pkg));
    const totalBudget = round2(packages.reduce((s, p) => s + p.budget, 0));
    const currency = packages[0]?.currency ?? "USD";

    const now = this.rt.clock.isoNow();
    const mediaBuy: MediaBuy = {
      media_buy_id: this.rt.ids.next("mb"),
      buyer_ref: req.buyer_ref,
      account: req.account,
      brand: req.brand,
      status: "pending_start",
      start_time: req.start_time,
      end_time: req.end_time,
      total_budget: totalBudget,
      currency,
      packages,
      created_at: now,
      updated_at: now,
    };
    this.store.mediaBuys.set(mediaBuy.media_buy_id, mediaBuy);
    if (req.idempotency_key) {
      this.store.idempotency.set(req.idempotency_key, mediaBuy.media_buy_id);
    }
    return { media_buy: this.refreshDelivery(mediaBuy), replayed: false };
  }

  private buildPackage(pkg: PackageInput): Package {
    const product = this.store.products.get(pkg.product_id);
    if (!product) throw AdcpError.notFound(`Product ${pkg.product_id}`);

    let opt: PricingOption = product.pricing_options[0];
    if (pkg.pricing_option_id) {
      const found = product.pricing_options.find((o) => o.pricing_option_id === pkg.pricing_option_id);
      if (!found) {
        throw AdcpError.invalid(`Unknown pricing_option_id ${pkg.pricing_option_id} for ${product.product_id}`);
      }
      opt = found;
    }
    if (opt.min_spend && pkg.budget < opt.min_spend) {
      throw AdcpError.invalid(
        `Budget ${pkg.budget} below min_spend ${opt.min_spend} for ${product.product_id}`,
      );
    }

    return {
      package_id: this.rt.ids.next("pkg"),
      product_id: pkg.product_id,
      budget: pkg.budget,
      pricing_option_id: opt.pricing_option_id,
      creative_ids: pkg.creative_ids ?? [],
      signal_ids: pkg.signal_ids ?? [],
      targeting_overlay: pkg.targeting_overlay,
      status: "pending_start",
      effective_price: opt.price,
      pricing_model: opt.model,
      currency: opt.currency,
      delivery: { impressions: 0, clicks: 0, spend: 0, completed_views: 0 },
    };
  }

  /** update_media_buy — modify budgets, dates, creative assignments, status. */
  updateMediaBuy(input: unknown): { media_buy: MediaBuy } {
    const req = parseOrThrow(UpdateMediaBuyRequest, input, "update_media_buy request");
    const mb = this.store.mediaBuys.get(req.media_buy_id);
    if (!mb) throw AdcpError.notFound(`Media buy ${req.media_buy_id}`);

    if (req.status) mb.status = req.status;
    if (req.end_time) {
      if (Date.parse(req.end_time) <= Date.parse(mb.start_time)) {
        throw AdcpError.invalid("end_time must be after start_time");
      }
      mb.end_time = req.end_time;
    }
    for (const upd of req.package_updates ?? []) {
      const pkg = mb.packages.find((p) => p.package_id === upd.package_id);
      if (!pkg) throw AdcpError.notFound(`Package ${upd.package_id}`);
      if (upd.budget !== undefined) pkg.budget = upd.budget;
      if (upd.status) pkg.status = upd.status;
      if (upd.creative_ids) pkg.creative_ids = upd.creative_ids;
    }
    mb.total_budget = round2(mb.packages.reduce((s, p) => s + p.budget, 0));
    mb.updated_at = this.rt.clock.isoNow();
    return { media_buy: this.refreshDelivery(mb) };
  }

  /** get_media_buys — operational status snapshot(s). */
  getMediaBuys(input?: { media_buy_id?: string; buyer_ref?: string }): { media_buys: MediaBuy[] } {
    let buys = this.store.listMediaBuys();
    if (input?.media_buy_id) buys = buys.filter((b) => b.media_buy_id === input.media_buy_id);
    if (input?.buyer_ref) buys = buys.filter((b) => b.buyer_ref === input.buyer_ref);
    return { media_buys: buys.map((b) => this.refreshDelivery(b)) };
  }

  /** get_media_buy_delivery — billing-grade delivery + performance report. */
  getMediaBuyDelivery(input: { media_buy_id: string }): {
    media_buy_id: string;
    status: string;
    impressions: number;
    clicks: number;
    ctr: number;
    completed_views: number;
    spend: { amount: number; currency: string };
    pacing: number;
    by_package: Array<{
      package_id: string;
      product_id: string;
      impressions: number;
      clicks: number;
      spend: number;
      completion_rate: number;
    }>;
  } {
    if (!input?.media_buy_id) throw AdcpError.invalid("media_buy_id is required");
    const mb = this.store.mediaBuys.get(input.media_buy_id);
    if (!mb) throw AdcpError.notFound(`Media buy ${input.media_buy_id}`);
    this.refreshDelivery(mb);

    const impressions = sum(mb.packages, (p) => p.delivery.impressions);
    const clicks = sum(mb.packages, (p) => p.delivery.clicks);
    const completed = sum(mb.packages, (p) => p.delivery.completed_views);
    const spend = round2(sum(mb.packages, (p) => p.delivery.spend));
    const pacing = mb.total_budget > 0 ? round2(spend / mb.total_budget) : 0;

    return {
      media_buy_id: mb.media_buy_id,
      status: mb.status,
      impressions,
      clicks,
      ctr: impressions > 0 ? round4(clicks / impressions) : 0,
      completed_views: completed,
      spend: { amount: spend, currency: mb.currency },
      pacing,
      by_package: mb.packages.map((p) => ({
        package_id: p.package_id,
        product_id: p.product_id,
        impressions: p.delivery.impressions,
        clicks: p.delivery.clicks,
        spend: round2(p.delivery.spend),
        completion_rate:
          p.delivery.impressions > 0 ? round2(p.delivery.completed_views / p.delivery.impressions) : 0,
      })),
    };
  }

  /** provide_performance_feedback — accept optimization signals. */
  providePerformanceFeedback(input: {
    media_buy_id: string;
    performance_index: number;
    measurement_period?: { start: string; end: string };
  }): { accepted: true; media_buy_id: string } {
    const mb = this.store.mediaBuys.get(input?.media_buy_id ?? "");
    if (!mb) throw AdcpError.notFound(`Media buy ${input?.media_buy_id}`);
    if (typeof input.performance_index !== "number") {
      throw AdcpError.invalid("performance_index must be a number");
    }
    return { accepted: true, media_buy_id: mb.media_buy_id };
  }

  /* -------------------------------------------------------------- */
  /* Commerce: accounts                                             */
  /* -------------------------------------------------------------- */

  /** sync_accounts — declare brand/operator pairs; seller provisions accounts. */
  syncAccounts(input: unknown): { accounts: AccountRecord[] } {
    const req = parseOrThrow(SyncAccountsRequest, input, "sync_accounts request");
    const out: AccountRecord[] = [];
    for (const a of req.accounts) {
      const accountId = accountKey(a.brand.domain, a.operator);
      const existing = this.store.accounts.get(accountId);
      const record: AccountRecord = {
        account_id: accountId,
        brand: a.brand,
        operator: a.operator,
        billing: a.billing,
        status: "active",
        created_at: existing?.created_at ?? this.rt.clock.isoNow(),
      };
      this.store.accounts.set(accountId, record);
      out.push(record);
    }
    return { accounts: out };
  }

  /** list_accounts — active commercial relationships. */
  listAccounts(input?: { status?: string }): { accounts: AccountRecord[] } {
    let accounts = [...this.store.accounts.values()];
    if (input?.status) accounts = accounts.filter((a) => a.status === input.status);
    return { accounts };
  }

  /* -------------------------------------------------------------- */
  /* Catalogs                                                       */
  /* -------------------------------------------------------------- */

  /** sync_catalogs — push product/store/inventory feeds to the account. */
  syncCatalogs(input: unknown): { catalogs: CatalogRecord[] } {
    const req = parseOrThrow(SyncCatalogsRequest, input, "sync_catalogs request");
    const out: CatalogRecord[] = [];
    for (const c of req.catalogs) {
      const record: CatalogRecord = { ...c, status: "synced", synced_at: this.rt.clock.isoNow() };
      this.store.catalogs.set(c.catalog_id, record);
      out.push(record);
    }
    return { catalogs: out };
  }

  /* -------------------------------------------------------------- */
  /* Audiences                                                      */
  /* -------------------------------------------------------------- */

  /** sync_audiences — upload first-party CRM audiences and get match status. */
  syncAudiences(input: unknown): { audiences: AudienceRecord[] } {
    const req = parseOrThrow(SyncAudiencesRequest, input, "sync_audiences request");
    const out: AudienceRecord[] = [];
    for (const a of req.audiences) {
      // Deterministic match rate derived from the audience id (no randomness).
      const matchRate = 0.55 + (hashStr(a.audience_id) % 40) / 100; // 0.55–0.95
      const record: AudienceRecord = {
        ...a,
        match_rate: round2(matchRate),
        status: "ready",
        synced_at: this.rt.clock.isoNow(),
      };
      this.store.audiences.set(a.audience_id, record);
      out.push(record);
    }
    return { audiences: out };
  }

  /* -------------------------------------------------------------- */
  /* Conversion tracking                                            */
  /* -------------------------------------------------------------- */

  /** sync_event_sources — configure conversion event sources on the account. */
  syncEventSources(input: unknown): { event_sources: EventSourceRecord[] } {
    const req = parseOrThrow(SyncEventSourcesRequest, input, "sync_event_sources request");
    const out: EventSourceRecord[] = [];
    for (const s of req.event_sources) {
      const record: EventSourceRecord = {
        event_source_id: s.event_source_id,
        type: s.type,
        name: s.name,
        created_at: this.rt.clock.isoNow(),
      };
      this.store.eventSources.set(s.event_source_id, record);
      out.push(record);
    }
    return { event_sources: out };
  }

  /** log_event — ingest marketing events for attribution. */
  logEvent(input: unknown): { accepted: number; total_events: number } {
    const req = parseOrThrow(LogEventRequest, input, "log_event request");
    if (!this.store.eventSources.has(req.event_source_id)) {
      throw AdcpError.notFound(`Event source ${req.event_source_id}`);
    }
    for (const e of req.events) this.store.events.push(e);
    return { accepted: req.events.length, total_events: this.store.events.length };
  }

  /* -------------------------------------------------------------- */
  /* Delivery engine                                                */
  /* -------------------------------------------------------------- */

  /**
   * Advance each media buy's status and cumulative delivery based on the
   * current clock relative to its flight window. Idempotent — safe to call on
   * every read.
   */
  refreshDelivery(mb: MediaBuy): MediaBuy {
    const now = this.rt.clock.now();
    const start = Date.parse(mb.start_time);
    const end = Date.parse(mb.end_time);
    const progress = now <= start ? 0 : now >= end ? 1 : (now - start) / (end - start);

    // Status transitions (respect explicit paused/rejected states).
    if (mb.status !== "paused" && mb.status !== "rejected") {
      mb.status = progress <= 0 ? "pending_start" : progress >= 1 ? "completed" : "active";
    }

    mb.packages.forEach((pkg, i) => {
      if (pkg.status !== "paused") {
        pkg.status = progress <= 0 ? "pending_start" : progress >= 1 ? "completed" : "active";
      }
      const seed = (i + 1) * 0.37 + hashStr(pkg.package_id) / 1e6;
      const sim = simulateDelivery({
        budget: pkg.budget,
        price: pkg.effective_price,
        model: pkg.pricing_model,
        progress: pkg.status === "paused" ? Math.min(progress, pkg.delivery.spend / (pkg.budget || 1)) : progress,
        seed,
      });
      pkg.delivery = {
        impressions: sim.impressions,
        clicks: sim.clicks,
        completed_views: sim.completed_views,
        spend: round2(sim.spend),
      };
    });
    return mb;
  }

  /** Convenience: forecasted impressions for a would-be package. */
  forecastPackage(productId: string, budget: number, pricingOptionId?: string): number {
    const product = this.store.products.get(productId);
    if (!product) throw AdcpError.notFound(`Product ${productId}`);
    const opt =
      (pricingOptionId
        ? product.pricing_options.find((o) => o.pricing_option_id === pricingOptionId)
        : product.pricing_options[0]) ?? product.pricing_options[0];
    return estimateImpressions(budget, opt);
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function scoreProduct(p: Product, terms: string[]): number {
  const hay = [
    p.name,
    p.description,
    ...p.channels,
    ...p.keywords,
    ...p.targeting.interests,
    ...p.targeting.geos,
    ...p.targeting.age_ranges,
  ]
    .join(" ")
    .toLowerCase();
  let score = 0;
  for (const t of terms) if (hay.includes(t)) score += 1;
  return score;
}

interface Review {
  ok: boolean;
  reason?: string;
}

/** Validate creative assets against a format's specs. */
function reviewCreative(assets: Record<string, { mime_type?: string; file_size_bytes?: number; width?: number; height?: number; duration_ms?: number }>, format: CreativeFormat): Review {
  const values = Object.values(assets);
  if (values.length === 0) return { ok: false, reason: "No assets provided" };
  const primary = values[0];

  if (format.accepts.length && primary.mime_type && !format.accepts.includes(primary.mime_type)) {
    return { ok: false, reason: `mime ${primary.mime_type} not in accepted ${format.accepts.join(", ")}` };
  }
  if (format.max_file_size_bytes && primary.file_size_bytes && primary.file_size_bytes > format.max_file_size_bytes) {
    return { ok: false, reason: `file too large (${primary.file_size_bytes} > ${format.max_file_size_bytes})` };
  }
  if (format.type === "display") {
    if (format.width && primary.width && primary.width !== format.width) {
      return { ok: false, reason: `width ${primary.width} != required ${format.width}` };
    }
    if (format.height && primary.height && primary.height !== format.height) {
      return { ok: false, reason: `height ${primary.height} != required ${format.height}` };
    }
  }
  if ((format.type === "video" || format.type === "audio") && format.duration_ms && primary.duration_ms) {
    // allow +/- 1s tolerance
    if (Math.abs(primary.duration_ms - format.duration_ms) > 1000) {
      return { ok: false, reason: `duration ${primary.duration_ms}ms != required ${format.duration_ms}ms` };
    }
  }
  return { ok: true };
}

function sum<T>(arr: T[], f: (t: T) => number): number {
  return arr.reduce((s, t) => s + f(t), 0);
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1_000_000;
  return h;
}
function accountKey(brandDomain: string, operator: string): string {
  return `acct_${operator}__${brandDomain}`.replace(/[^a-z0-9_]/gi, "_");
}
