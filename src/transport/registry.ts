/**
 * Task registry — the single source of truth mapping AdCP task names to
 * handlers, shared by every transport (MCP tools, HTTP/JSON-RPC).
 *
 * An agent "node" can host any combination of sales, creative, and signals
 * capabilities; the registry only exposes tasks for the agents that are wired
 * in, and `capabilities()` reports exactly what the node advertises.
 */
import { z } from "zod";
import type { SalesAgent } from "../agents/sales-agent.js";
import type { CreativeAgent } from "../agents/creative-agent.js";
import type { SignalsAgent } from "../agents/signals-agent.js";
import {
  GetProductsRequest,
  CreateMediaBuyRequest,
  UpdateMediaBuyRequest,
  SyncCreativesRequest,
  BuildCreativeRequest,
  GetSignalsRequest,
  ActivateSignalRequest,
  SyncAccountsRequest,
  SyncCatalogsRequest,
  SyncAudiencesRequest,
  SyncEventSourcesRequest,
  LogEventRequest,
} from "../core/schemas.js";

export interface TaskDef {
  name: string;
  description: string;
  /** Zod schema for the task input (used for validation + tool schemas). */
  input: z.ZodTypeAny;
  handler: (input: unknown) => unknown | Promise<unknown>;
}

export interface AgentNode {
  name: string;
  sales?: SalesAgent;
  creative?: CreativeAgent;
  signals?: SignalsAgent;
}

const anyObj = z.object({}).passthrough();

export function buildRegistry(node: AgentNode): TaskDef[] {
  const tasks: TaskDef[] = [];
  const { sales, creative, signals } = node;

  if (sales) {
    tasks.push(
      {
        name: "get_products",
        description: "Discover advertising inventory from a natural-language brief.",
        input: GetProductsRequest,
        handler: (i) => sales.getProducts(i),
      },
      {
        name: "list_creative_formats",
        description: "List supported creative format specifications.",
        input: z.object({ type: z.string().optional() }),
        handler: (i) => sales.listCreativeFormats(i as { type?: string }),
      },
      {
        name: "sync_creatives",
        description: "Upload/upsert creatives into the seller's library (with review).",
        input: SyncCreativesRequest,
        handler: (i) => sales.syncCreatives(i),
      },
      {
        name: "list_creatives",
        description: "Query the seller's creative library.",
        input: z.object({ status: z.string().optional(), format_id: z.string().optional() }),
        handler: (i) => sales.listCreatives(i as { status?: string; format_id?: string }),
      },
      {
        name: "create_media_buy",
        description: "Create a media buy (campaign) from selected products.",
        input: CreateMediaBuyRequest,
        handler: (i) => sales.createMediaBuy(i),
      },
      {
        name: "update_media_buy",
        description: "Update budgets, dates, status, or creative assignments on a media buy.",
        input: UpdateMediaBuyRequest,
        handler: (i) => sales.updateMediaBuy(i),
      },
      {
        name: "get_media_buys",
        description: "Retrieve media-buy status snapshots.",
        input: z.object({ media_buy_id: z.string().optional(), buyer_ref: z.string().optional() }),
        handler: (i) => sales.getMediaBuys(i as { media_buy_id?: string; buyer_ref?: string }),
      },
      {
        name: "get_media_buy_delivery",
        description: "Retrieve billing-grade delivery & performance for a media buy.",
        input: z.object({ media_buy_id: z.string() }),
        handler: (i) => sales.getMediaBuyDelivery(i as { media_buy_id: string }),
      },
      {
        name: "provide_performance_feedback",
        description: "Submit a performance index to help the seller optimize.",
        input: z.object({
          media_buy_id: z.string(),
          performance_index: z.number(),
          measurement_period: z
            .object({ start: z.string(), end: z.string() })
            .optional(),
        }),
        handler: (i) =>
          sales.providePerformanceFeedback(
            i as { media_buy_id: string; performance_index: number },
          ),
      },
      {
        name: "sync_accounts",
        description: "Declare brand/operator pairs and billing; seller provisions accounts.",
        input: SyncAccountsRequest,
        handler: (i) => sales.syncAccounts(i),
      },
      {
        name: "list_accounts",
        description: "List active commercial relationships (accounts).",
        input: z.object({ status: z.string().optional() }),
        handler: (i) => sales.listAccounts(i as { status?: string }),
      },
      {
        name: "sync_catalogs",
        description: "Sync product/store/inventory catalog feeds to an account.",
        input: SyncCatalogsRequest,
        handler: (i) => sales.syncCatalogs(i),
      },
      {
        name: "sync_audiences",
        description: "Upload and manage first-party CRM audiences.",
        input: SyncAudiencesRequest,
        handler: (i) => sales.syncAudiences(i),
      },
      {
        name: "sync_event_sources",
        description: "Configure conversion event sources on an account.",
        input: SyncEventSourcesRequest,
        handler: (i) => sales.syncEventSources(i),
      },
      {
        name: "log_event",
        description: "Send marketing events (purchases, leads, …) for attribution.",
        input: LogEventRequest,
        handler: (i) => sales.logEvent(i),
      },
    );
  }

  if (creative) {
    tasks.push(
      {
        name: "build_creative",
        description: "Generate creatives for a set of target formats from one brief.",
        input: BuildCreativeRequest,
        handler: (i) => creative.buildCreative(i),
      },
      {
        name: "list_creative_formats_creative",
        description: "List creative formats this creative agent can produce.",
        input: z.object({ type: z.string().optional() }),
        handler: (i) => creative.listCreativeFormats(i as { type?: string }),
      },
    );
  }

  if (signals) {
    tasks.push(
      {
        name: "get_signals",
        description: "Discover third-party targeting signals from a natural-language spec.",
        input: GetSignalsRequest,
        handler: (i) => signals.getSignals(i),
      },
      {
        name: "activate_signal",
        description: "Activate a targeting signal onto a destination platform.",
        input: ActivateSignalRequest,
        handler: (i) => signals.activateSignal(i),
      },
    );
  }

  // Protocol-level capability discovery.
  tasks.push({
    name: "get_adcp_capabilities",
    description: "Report this agent node's supported AdCP tasks and domains.",
    input: anyObj,
    handler: () => capabilities(node, tasks),
  });

  return tasks;
}

export function capabilities(node: AgentNode, tasks: TaskDef[]) {
  const domains: string[] = [];
  if (node.sales) domains.push("media-buy");
  if (node.creative) domains.push("creative");
  if (node.signals) domains.push("signals");
  return {
    name: node.name,
    protocol: "adcp",
    version: "3.x",
    domains,
    tasks: tasks.map((t) => t.name).filter((n) => n !== "get_adcp_capabilities"),
  };
}
