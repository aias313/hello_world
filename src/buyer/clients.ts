/**
 * Buyer-side client interfaces + in-process adapters.
 *
 * A buyer/orchestrator talks to sales, creative, and signals agents through
 * these transport-agnostic async interfaces. `inProc*` adapters wrap a local
 * agent instance; the HTTP clients (see ../http/client.ts) satisfy the same
 * interfaces over the wire, so the orchestrator is identical either way.
 */
import type { SalesAgent } from "../agents/sales-agent.js";
import type { CreativeAgent, BuildResult } from "../agents/creative-agent.js";
import type { SignalsAgent, Activation } from "../agents/signals-agent.js";
import type {
  CreativeFormat,
  MediaBuy,
  Product,
  Creative,
  Signal,
  AccountRecord,
} from "../core/schemas.js";

export interface DeliveryReport {
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
}

export interface SalesClient {
  getProducts(req: unknown): Promise<{ products: Product[] }>;
  listCreativeFormats(req?: { type?: string }): Promise<{ formats: CreativeFormat[] }>;
  syncCreatives(req: unknown): Promise<{ creatives: Creative[] }>;
  listCreatives(req?: { status?: string; format_id?: string }): Promise<{ creatives: Creative[] }>;
  createMediaBuy(req: unknown): Promise<{ media_buy: MediaBuy; replayed: boolean }>;
  updateMediaBuy(req: unknown): Promise<{ media_buy: MediaBuy }>;
  getMediaBuys(req?: { media_buy_id?: string; buyer_ref?: string }): Promise<{ media_buys: MediaBuy[] }>;
  getMediaBuyDelivery(req: { media_buy_id: string }): Promise<DeliveryReport>;
  providePerformanceFeedback(req: {
    media_buy_id: string;
    performance_index: number;
    measurement_period?: { start: string; end: string };
  }): Promise<{ accepted: true; media_buy_id: string }>;
  syncAccounts(req: unknown): Promise<{ accounts: AccountRecord[] }>;
  listAccounts(req?: { status?: string }): Promise<{ accounts: AccountRecord[] }>;
  syncCatalogs(req: unknown): Promise<{ catalogs: unknown[] }>;
  syncAudiences(req: unknown): Promise<{ audiences: unknown[] }>;
  syncEventSources(req: unknown): Promise<{ event_sources: unknown[] }>;
  logEvent(req: unknown): Promise<{ accepted: number; total_events: number }>;
}

export interface CreativeClient {
  listCreativeFormats(req?: { type?: string }): Promise<{ formats: CreativeFormat[] }>;
  buildCreative(req: unknown): Promise<BuildResult>;
  listCreatives(req?: { format_id?: string }): Promise<{ creatives: Creative[] }>;
}

export interface SignalsClient {
  getSignals(req: unknown): Promise<{ signals: Array<Signal & { relevance: number }> }>;
  activateSignal(req: unknown): Promise<{ activation: Activation; replayed: boolean }>;
}

/* ------------------------------------------------------------------ */
/* In-process adapters                                                 */
/* ------------------------------------------------------------------ */

export function inProcSales(agent: SalesAgent): SalesClient {
  return {
    getProducts: async (r) => agent.getProducts(r),
    listCreativeFormats: async (r) => agent.listCreativeFormats(r),
    syncCreatives: async (r) => agent.syncCreatives(r),
    listCreatives: async (r) => agent.listCreatives(r),
    createMediaBuy: async (r) => agent.createMediaBuy(r),
    updateMediaBuy: async (r) => agent.updateMediaBuy(r),
    getMediaBuys: async (r) => agent.getMediaBuys(r),
    getMediaBuyDelivery: async (r) => agent.getMediaBuyDelivery(r),
    providePerformanceFeedback: async (r) => agent.providePerformanceFeedback(r),
    syncAccounts: async (r) => agent.syncAccounts(r),
    listAccounts: async (r) => agent.listAccounts(r),
    syncCatalogs: async (r) => agent.syncCatalogs(r),
    syncAudiences: async (r) => agent.syncAudiences(r),
    syncEventSources: async (r) => agent.syncEventSources(r),
    logEvent: async (r) => agent.logEvent(r),
  };
}

export function inProcCreative(agent: CreativeAgent): CreativeClient {
  return {
    listCreativeFormats: async (r) => agent.listCreativeFormats(r),
    buildCreative: async (r) => agent.buildCreative(r),
    listCreatives: async (r) => agent.listCreatives(r),
  };
}

export function inProcSignals(agent: SignalsAgent): SignalsClient {
  return {
    getSignals: async (r) => agent.getSignals(r),
    activateSignal: async (r) => agent.activateSignal(r),
  };
}
