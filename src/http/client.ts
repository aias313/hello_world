/**
 * HTTP clients — implement the buyer-side client interfaces by calling a
 * remote AdCP agent's HTTP transport. The orchestrator can be pointed at these
 * instead of in-process adapters with no other changes.
 */
import { AdcpError } from "../core/index.js";
import type {
  SalesClient,
  CreativeClient,
  SignalsClient,
  DeliveryReport,
} from "../buyer/clients.js";

async function call<T>(baseUrl: string, task: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}/tasks/${task}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const e = json?.error ?? {};
    throw new AdcpError(e.code ?? "http_error", e.message ?? `HTTP ${res.status}`, res.status, e.details);
  }
  return json as T;
}

export function httpSales(baseUrl: string): SalesClient {
  return {
    getProducts: (r) => call(baseUrl, "get_products", r),
    listCreativeFormats: (r) => call(baseUrl, "list_creative_formats", r ?? {}),
    syncCreatives: (r) => call(baseUrl, "sync_creatives", r),
    listCreatives: (r) => call(baseUrl, "list_creatives", r ?? {}),
    createMediaBuy: (r) => call(baseUrl, "create_media_buy", r),
    updateMediaBuy: (r) => call(baseUrl, "update_media_buy", r),
    getMediaBuys: (r) => call(baseUrl, "get_media_buys", r ?? {}),
    getMediaBuyDelivery: (r) => call<DeliveryReport>(baseUrl, "get_media_buy_delivery", r),
    providePerformanceFeedback: (r) => call(baseUrl, "provide_performance_feedback", r),
  };
}

export function httpCreative(baseUrl: string): CreativeClient {
  return {
    listCreativeFormats: (r) => call(baseUrl, "list_creative_formats_creative", r ?? {}),
    buildCreative: (r) => call(baseUrl, "build_creative", r),
    listCreatives: (r) => call(baseUrl, "list_creatives", r ?? {}),
  };
}

export function httpSignals(baseUrl: string): SignalsClient {
  return {
    getSignals: (r) => call(baseUrl, "get_signals", r),
    activateSignal: (r) => call(baseUrl, "activate_signal", r),
  };
}
