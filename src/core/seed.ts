/**
 * Seed inventory for the reference sales / creative / signals agents.
 *
 * This gives the suite a realistic catalog so the end-to-end orchestration
 * demo and tests operate on believable data.
 */
import type { CreativeFormat, Product, Signal } from "./schemas.js";

export const DEFAULT_AGENT_URL = "https://ads.streamhaus.tv";

export const SEED_FORMATS: CreativeFormat[] = [
  {
    id: "video_16x9_30s",
    name: "CTV Video 16:9 30s",
    type: "video",
    width: 1920,
    height: 1080,
    duration_ms: 30000,
    accepts: ["video/mp4", "video/webm"],
    max_file_size_bytes: 50_000_000,
  },
  {
    id: "video_16x9_15s",
    name: "Online Video 16:9 15s",
    type: "video",
    width: 1280,
    height: 720,
    duration_ms: 15000,
    accepts: ["video/mp4"],
    max_file_size_bytes: 30_000_000,
  },
  {
    id: "display_300x250",
    name: "Display Medium Rectangle",
    type: "display",
    width: 300,
    height: 250,
    accepts: ["image/png", "image/jpeg", "text/html"],
    max_file_size_bytes: 200_000,
  },
  {
    id: "display_728x90",
    name: "Display Leaderboard",
    type: "display",
    width: 728,
    height: 90,
    accepts: ["image/png", "image/jpeg", "text/html"],
    max_file_size_bytes: 200_000,
  },
  {
    id: "audio_30s",
    name: "Streaming Audio 30s",
    type: "audio",
    duration_ms: 30000,
    accepts: ["audio/mpeg", "audio/aac"],
    max_file_size_bytes: 5_000_000,
  },
];

function fmt(id: string) {
  return { agent_url: DEFAULT_AGENT_URL, id };
}

export const SEED_PRODUCTS: Product[] = [
  {
    product_id: "streamhaus_sports_ctv",
    name: "StreamHaus Sports Premium (CTV)",
    description: "Premium live and on-demand sports inventory on connected TV.",
    channels: ["ctv"],
    delivery_type: "guaranteed",
    is_fixed_price: true,
    pricing_options: [
      { pricing_option_id: "cpm_standard", model: "cpm", price: 28.5, currency: "USD", min_spend: 5000 },
    ],
    forecast: { impressions: { min: 500_000, max: 750_000 } },
    format_ids: [fmt("video_16x9_30s"), fmt("video_16x9_15s")],
    targeting: {
      geos: ["US", "CA"],
      age_ranges: ["18-24", "25-34", "35-44"],
      interests: ["sports", "outdoor", "fitness"],
    },
    keywords: ["sports", "ctv", "video", "premium", "live", "football", "outdoor"],
  },
  {
    product_id: "streamhaus_olv_run_of_network",
    name: "StreamHaus Online Video RON",
    description: "Run-of-network online video across entertainment and lifestyle.",
    channels: ["olv"],
    delivery_type: "non_guaranteed",
    is_fixed_price: false,
    pricing_options: [
      { pricing_option_id: "cpm_olv", model: "cpm", price: 14.0, currency: "USD" },
      { pricing_option_id: "cpcv_olv", model: "cpcv", price: 0.06, currency: "USD" },
    ],
    forecast: { impressions: { min: 1_000_000, max: 3_000_000 } },
    format_ids: [fmt("video_16x9_15s")],
    targeting: {
      geos: ["US"],
      age_ranges: ["18-24", "25-34", "35-44", "45-54"],
      interests: ["entertainment", "lifestyle", "outdoor"],
    },
    keywords: ["olv", "online video", "run of network", "lifestyle", "entertainment"],
  },
  {
    product_id: "streamhaus_display_ros",
    name: "StreamHaus Display Run-of-Site",
    description: "High-viewability display across StreamHaus owned & operated.",
    channels: ["display"],
    delivery_type: "non_guaranteed",
    is_fixed_price: false,
    pricing_options: [
      { pricing_option_id: "cpm_display", model: "cpm", price: 4.25, currency: "USD" },
      { pricing_option_id: "cpc_display", model: "cpc", price: 0.85, currency: "USD" },
    ],
    forecast: { impressions: { min: 5_000_000, max: 12_000_000 } },
    format_ids: [fmt("display_300x250"), fmt("display_728x90")],
    targeting: {
      geos: ["US", "CA", "UK"],
      age_ranges: ["18-24", "25-34", "35-44", "45-54", "55+"],
      interests: ["news", "sports", "shopping", "outdoor"],
    },
    keywords: ["display", "banner", "run of site", "cheap", "reach"],
  },
  {
    product_id: "streamhaus_audio_network",
    name: "StreamHaus Streaming Audio Network",
    description: "Podcast and streaming-music audio inventory.",
    channels: ["audio"],
    delivery_type: "non_guaranteed",
    is_fixed_price: false,
    pricing_options: [
      { pricing_option_id: "cpm_audio", model: "cpm", price: 18.0, currency: "USD" },
    ],
    forecast: { impressions: { min: 800_000, max: 2_000_000 } },
    format_ids: [fmt("audio_30s")],
    targeting: {
      geos: ["US"],
      age_ranges: ["18-24", "25-34", "35-44"],
      interests: ["music", "podcast", "sports", "outdoor"],
    },
    keywords: ["audio", "podcast", "streaming", "music", "sports"],
  },
];

export const SEED_SIGNALS: Signal[] = [
  {
    signal_agent_segment_id: "meridian_outdoor_rec_25_45",
    name: "Outdoor Recreation Enthusiasts 25-45",
    description: "People who frequently visit parks, trails and sporting-goods retailers.",
    coverage_pct: 62,
    pricing: { amount: 1.5, currency: "USD" },
    keywords: ["outdoor", "recreation", "hiking", "sports", "camping", "25-45"],
  },
  {
    signal_agent_segment_id: "meridian_instore_sportinggoods",
    name: "In-Market: Sporting Goods",
    description: "Recent visitors to sporting-goods and outdoor retail locations.",
    coverage_pct: 48,
    pricing: { amount: 2.25, currency: "USD" },
    keywords: ["sporting goods", "retail", "in-market", "outdoor", "shopping"],
  },
  {
    signal_agent_segment_id: "meridian_ctv_sports_viewers",
    name: "CTV Sports Viewers",
    description: "Households with high live-sports viewership on connected TV.",
    coverage_pct: 71,
    pricing: { amount: 1.1, currency: "USD" },
    keywords: ["ctv", "sports", "live", "viewers", "television"],
  },
];
