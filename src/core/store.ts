/**
 * In-memory data store for a single AdCP agent instance.
 *
 * Deliberately simple (Maps), but isolated behind this class so a real
 * implementation could swap in a database without touching agent logic.
 */
import type {
  AccountRecord,
  CatalogInput,
  AudienceInput,
  Creative,
  CreativeFormat,
  MarketingEvent,
  MediaBuy,
  Product,
  Signal,
} from "./schemas.js";

export interface EventSourceRecord {
  event_source_id: string;
  type: string;
  name?: string;
  created_at: string;
}

export interface CatalogRecord extends CatalogInput {
  status: "synced" | "processing";
  synced_at: string;
}

export interface AudienceRecord extends AudienceInput {
  match_rate: number;
  status: "matching" | "ready";
  synced_at: string;
}

export class Store {
  readonly products = new Map<string, Product>();
  readonly formats = new Map<string, CreativeFormat>();
  readonly creatives = new Map<string, Creative>();
  readonly mediaBuys = new Map<string, MediaBuy>();
  readonly signals = new Map<string, Signal>();
  readonly accounts = new Map<string, AccountRecord>();
  readonly catalogs = new Map<string, CatalogRecord>();
  readonly audiences = new Map<string, AudienceRecord>();
  readonly eventSources = new Map<string, EventSourceRecord>();
  readonly events: MarketingEvent[] = [];
  /** idempotency_key -> media_buy_id, for safe create retries. */
  readonly idempotency = new Map<string, string>();

  seedProducts(products: Product[]): void {
    for (const p of products) this.products.set(p.product_id, p);
  }
  seedFormats(formats: CreativeFormat[]): void {
    for (const f of formats) this.formats.set(f.id, f);
  }
  seedSignals(signals: Signal[]): void {
    for (const s of signals) this.signals.set(s.signal_agent_segment_id, s);
  }

  listProducts(): Product[] {
    return [...this.products.values()];
  }
  listFormats(): CreativeFormat[] {
    return [...this.formats.values()];
  }
  listMediaBuys(): MediaBuy[] {
    return [...this.mediaBuys.values()];
  }
  listCreatives(): Creative[] {
    return [...this.creatives.values()];
  }
  listSignals(): Signal[] {
    return [...this.signals.values()];
  }
}
