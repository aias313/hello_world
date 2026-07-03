/**
 * AdCP domain schemas (Zod) and inferred TypeScript types.
 *
 * These follow the shapes described by the AdCP Media Buy, Creative, and
 * Signals task references. They are intentionally a faithful-but-pragmatic
 * subset: enough structure to run a full buy/sell/creative lifecycle with
 * real validation at every protocol boundary.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

export const Channel = z.enum([
  "ctv",
  "olv",
  "display",
  "audio",
  "native",
  "social",
  "dooh",
  "retail_media",
]);
export type Channel = z.infer<typeof Channel>;

export const Currency = z.string().length(3).default("USD");

/** A reference to a creative format hosted by a specific agent. */
export const FormatId = z.object({
  agent_url: z.string(),
  id: z.string(),
});
export type FormatId = z.infer<typeof FormatId>;

export const Brand = z.object({
  domain: z.string(),
  name: z.string().optional(),
});
export type Brand = z.infer<typeof Brand>;

export const Account = z.object({
  brand: Brand,
  operator: z.string(),
  billing: z.enum(["operator", "brand"]).default("operator"),
});
export type Account = z.infer<typeof Account>;

export const Money = z.object({
  amount: z.number(),
  currency: Currency,
});
export type Money = z.infer<typeof Money>;

/* ------------------------------------------------------------------ */
/* Creative formats                                                    */
/* ------------------------------------------------------------------ */

export const CreativeType = z.enum(["video", "display", "audio", "native"]);
export type CreativeType = z.infer<typeof CreativeType>;

export const CreativeFormat = z.object({
  id: z.string(),
  name: z.string(),
  type: CreativeType,
  /** Pixel dimensions where relevant (display/video). */
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** Duration in ms for video/audio. */
  duration_ms: z.number().int().positive().optional(),
  /** Accepted file mime types. */
  accepts: z.array(z.string()).default([]),
  /** Maximum file size in bytes. */
  max_file_size_bytes: z.number().int().positive().optional(),
});
export type CreativeFormat = z.infer<typeof CreativeFormat>;

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

export const PricingModel = z.enum(["cpm", "cpc", "cpcv", "flat_rate"]);
export type PricingModel = z.infer<typeof PricingModel>;

export const PricingOption = z.object({
  pricing_option_id: z.string(),
  model: PricingModel,
  price: z.number().nonnegative(),
  currency: Currency,
  /** Minimum spend to activate this pricing option. */
  min_spend: z.number().nonnegative().optional(),
});
export type PricingOption = z.infer<typeof PricingOption>;

export const Forecast = z.object({
  impressions: z
    .object({ min: z.number().nonnegative(), max: z.number().nonnegative() })
    .optional(),
});
export type Forecast = z.infer<typeof Forecast>;

export const Product = z.object({
  product_id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  channels: z.array(Channel).min(1),
  delivery_type: z.enum(["guaranteed", "non_guaranteed"]).default("non_guaranteed"),
  is_fixed_price: z.boolean().default(false),
  pricing_options: z.array(PricingOption).min(1),
  forecast: Forecast.optional(),
  format_ids: z.array(FormatId).default([]),
  /** Free-form targeting attributes the product supports. */
  targeting: z
    .object({
      geos: z.array(z.string()).default([]),
      age_ranges: z.array(z.string()).default([]),
      interests: z.array(z.string()).default([]),
    })
    .default({ geos: [], age_ranges: [], interests: [] }),
  /** Keywords used by natural-language discovery. */
  keywords: z.array(z.string()).default([]),
});
export type Product = z.infer<typeof Product>;

/* ------------------------------------------------------------------ */
/* Creatives                                                           */
/* ------------------------------------------------------------------ */

export const CreativeAsset = z.object({
  asset_type: z.enum(["video", "image", "audio", "text", "url"]),
  url: z.string().optional(),
  text: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration_ms: z.number().int().positive().optional(),
  mime_type: z.string().optional(),
  file_size_bytes: z.number().int().positive().optional(),
});
export type CreativeAsset = z.infer<typeof CreativeAsset>;

export const CreativeStatus = z.enum(["pending_review", "approved", "rejected"]);
export type CreativeStatus = z.infer<typeof CreativeStatus>;

export const Creative = z.object({
  creative_id: z.string(),
  name: z.string(),
  format_id: FormatId,
  assets: z.record(z.string(), CreativeAsset),
  status: CreativeStatus.default("pending_review"),
  /** Reason attached when a creative is rejected. */
  status_reason: z.string().optional(),
  brand: Brand.optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type Creative = z.infer<typeof Creative>;

/* ------------------------------------------------------------------ */
/* Media buys & packages                                               */
/* ------------------------------------------------------------------ */

export const PackageStatus = z.enum([
  "draft",
  "pending_start",
  "active",
  "paused",
  "completed",
]);
export type PackageStatus = z.infer<typeof PackageStatus>;

export const PackageInput = z.object({
  product_id: z.string(),
  budget: z.number().positive(),
  pricing_option_id: z.string().optional(),
  /** Creative ids from the buyer's synced library assigned to this package. */
  creative_ids: z.array(z.string()).default([]),
  /** Activated signal segment ids layered onto this package. */
  signal_ids: z.array(z.string()).default([]),
  targeting_overlay: z
    .object({
      geos: z.array(z.string()).optional(),
      interests: z.array(z.string()).optional(),
    })
    .optional(),
});
export type PackageInput = z.infer<typeof PackageInput>;

export const PackageDelivery = z.object({
  impressions: z.number().nonnegative(),
  clicks: z.number().nonnegative(),
  spend: z.number().nonnegative(),
  completed_views: z.number().nonnegative().default(0),
});
export type PackageDelivery = z.infer<typeof PackageDelivery>;

export const Package = PackageInput.extend({
  package_id: z.string(),
  status: PackageStatus.default("draft"),
  effective_price: z.number().nonnegative(),
  pricing_model: PricingModel,
  currency: Currency,
  delivery: PackageDelivery,
});
export type Package = z.infer<typeof Package>;

export const MediaBuyStatus = z.enum([
  "pending_start",
  "active",
  "paused",
  "completed",
  "rejected",
]);
export type MediaBuyStatus = z.infer<typeof MediaBuyStatus>;

export const MediaBuy = z.object({
  media_buy_id: z.string(),
  buyer_ref: z.string().optional(),
  account: Account,
  brand: Brand,
  status: MediaBuyStatus,
  start_time: z.string(),
  end_time: z.string(),
  total_budget: z.number().nonnegative(),
  currency: Currency,
  packages: z.array(Package),
  created_at: z.string(),
  updated_at: z.string(),
});
export type MediaBuy = z.infer<typeof MediaBuy>;

/* ------------------------------------------------------------------ */
/* Signals                                                             */
/* ------------------------------------------------------------------ */

export const Signal = z.object({
  signal_agent_segment_id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  coverage_pct: z.number().min(0).max(100).default(0),
  pricing: Money,
  keywords: z.array(z.string()).default([]),
});
export type Signal = z.infer<typeof Signal>;

/* ------------------------------------------------------------------ */
/* Task request/response schemas                                       */
/* ------------------------------------------------------------------ */

export const GetProductsRequest = z.object({
  buying_mode: z.enum(["brief", "refine"]).default("brief"),
  brief: z.string().optional(),
  brand: Brand.optional(),
  channels: z.array(Channel).optional(),
  max_budget: z.number().positive().optional(),
  refine: z
    .array(
      z.object({
        scope: z.enum(["product", "request"]),
        product_id: z.string().optional(),
        action: z.enum(["more_like_this", "remove", "adjust"]).optional(),
        ask: z.string(),
      }),
    )
    .optional(),
});
export type GetProductsRequest = z.infer<typeof GetProductsRequest>;

export const CreateMediaBuyRequest = z.object({
  idempotency_key: z.string().optional(),
  buyer_ref: z.string().optional(),
  account: Account,
  brand: Brand,
  start_time: z.string(),
  end_time: z.string(),
  packages: z.array(PackageInput).min(1),
});
export type CreateMediaBuyRequest = z.infer<typeof CreateMediaBuyRequest>;

export const UpdateMediaBuyRequest = z.object({
  media_buy_id: z.string(),
  status: MediaBuyStatus.optional(),
  end_time: z.string().optional(),
  package_updates: z
    .array(
      z.object({
        package_id: z.string(),
        budget: z.number().positive().optional(),
        status: PackageStatus.optional(),
        creative_ids: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});
export type UpdateMediaBuyRequest = z.infer<typeof UpdateMediaBuyRequest>;

export const SyncCreativesRequest = z.object({
  idempotency_key: z.string().optional(),
  account: Account.optional(),
  creatives: z.array(
    Creative.pick({
      creative_id: true,
      name: true,
      format_id: true,
      assets: true,
      brand: true,
    }),
  ),
});
export type SyncCreativesRequest = z.infer<typeof SyncCreativesRequest>;

export const BuildCreativeRequest = z.object({
  idempotency_key: z.string().optional(),
  message: z.string(),
  brand: Brand.optional(),
  target_format_ids: z.array(FormatId).min(1),
  /** Optional revision of a previously built creative set. */
  refine_of: z.string().optional(),
});
export type BuildCreativeRequest = z.infer<typeof BuildCreativeRequest>;

export const GetSignalsRequest = z.object({
  signal_spec: z.string(),
  max_price: z.number().positive().optional(),
});
export type GetSignalsRequest = z.infer<typeof GetSignalsRequest>;

export const ActivateSignalRequest = z.object({
  idempotency_key: z.string().optional(),
  signal_agent_segment_id: z.string(),
  destinations: z.array(
    z.object({
      type: z.literal("platform"),
      platform: z.string(),
    }),
  ),
});
export type ActivateSignalRequest = z.infer<typeof ActivateSignalRequest>;

/* ------------------------------------------------------------------ */
/* Commerce: accounts                                                  */
/* ------------------------------------------------------------------ */

export const AccountStatus = z.enum(["active", "pending_review", "rejected"]);
export type AccountStatus = z.infer<typeof AccountStatus>;

export const AccountRecord = Account.extend({
  account_id: z.string(),
  status: AccountStatus,
  created_at: z.string(),
});
export type AccountRecord = z.infer<typeof AccountRecord>;

export const SyncAccountsRequest = z.object({
  idempotency_key: z.string().optional(),
  accounts: z
    .array(
      z.object({
        brand: Brand,
        operator: z.string(),
        billing: z.enum(["operator", "brand"]).default("operator"),
      }),
    )
    .min(1),
});
export type SyncAccountsRequest = z.infer<typeof SyncAccountsRequest>;

/* ------------------------------------------------------------------ */
/* Catalogs                                                            */
/* ------------------------------------------------------------------ */

export const CatalogInput = z.object({
  catalog_id: z.string(),
  name: z.string(),
  type: z.enum(["product", "store", "inventory"]).default("product"),
  url: z.string(),
  feed_format: z.enum(["shopify", "google", "csv", "json"]).default("json"),
  update_frequency: z.enum(["hourly", "daily", "weekly"]).default("daily"),
});
export type CatalogInput = z.infer<typeof CatalogInput>;

export const SyncCatalogsRequest = z.object({
  idempotency_key: z.string().optional(),
  account: Account.optional(),
  catalogs: z.array(CatalogInput).min(1),
});
export type SyncCatalogsRequest = z.infer<typeof SyncCatalogsRequest>;

/* ------------------------------------------------------------------ */
/* Audiences                                                           */
/* ------------------------------------------------------------------ */

export const AudienceInput = z.object({
  audience_id: z.string(),
  name: z.string(),
  audience_type: z.enum(["targeting", "suppression"]).default("targeting"),
  /** Optional count of hashed members supplied. */
  member_count: z.number().int().nonnegative().optional(),
});
export type AudienceInput = z.infer<typeof AudienceInput>;

export const SyncAudiencesRequest = z.object({
  idempotency_key: z.string().optional(),
  account: Account.optional(),
  audiences: z.array(AudienceInput).min(1),
});
export type SyncAudiencesRequest = z.infer<typeof SyncAudiencesRequest>;

/* ------------------------------------------------------------------ */
/* Conversion tracking                                                 */
/* ------------------------------------------------------------------ */

export const SyncEventSourcesRequest = z.object({
  idempotency_key: z.string().optional(),
  account: Account.optional(),
  event_sources: z
    .array(
      z.object({
        event_source_id: z.string(),
        type: z.enum(["pixel", "server", "app_sdk", "offline"]).default("pixel"),
        name: z.string().optional(),
      }),
    )
    .min(1),
});
export type SyncEventSourcesRequest = z.infer<typeof SyncEventSourcesRequest>;

export const MarketingEvent = z.object({
  event_id: z.string(),
  event_type: z.enum(["purchase", "lead", "sign_up", "add_to_cart", "page_view", "custom"]),
  event_time: z.string(),
  action_source: z.enum(["website", "app", "physical_store", "offline"]).default("website"),
  custom_data: z.record(z.string(), z.unknown()).optional(),
});
export type MarketingEvent = z.infer<typeof MarketingEvent>;

export const LogEventRequest = z.object({
  idempotency_key: z.string().optional(),
  event_source_id: z.string(),
  events: z.array(MarketingEvent).min(1),
});
export type LogEventRequest = z.infer<typeof LogEventRequest>;
