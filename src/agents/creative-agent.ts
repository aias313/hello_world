/**
 * Creative agent — the "creative management" side of the suite.
 *
 * Generates creative sets from a single brief across many target formats
 * (build_creative), supports conversational refinement, validates against
 * format specs, and maintains a creative library that can be listed and
 * synced downstream to sellers.
 */
import {
  AdcpError,
  parseOrThrow,
  Store,
  type Runtime,
  systemRuntime,
  SEED_FORMATS,
  DEFAULT_AGENT_URL,
} from "../core/index.js";
import {
  BuildCreativeRequest,
  type Brand,
  type Creative,
  type CreativeAsset,
  type CreativeFormat,
  type FormatId,
} from "../core/schemas.js";

export interface CreativeAgentOptions {
  agentUrl?: string;
  runtime?: Runtime;
  /** Known formats this agent can build for, keyed by id. */
  formats?: CreativeFormat[];
  /** Base URL used for generated asset locations. */
  cdnBase?: string;
}

export interface BuildResult {
  creative_set_id: string;
  brief: string;
  creatives: Creative[];
}

export class CreativeAgent {
  readonly agentUrl: string;
  readonly store = new Store();
  private readonly rt: Runtime;
  private readonly cdnBase: string;
  /** creative_set_id -> BuildResult for refinement lineage. */
  private readonly sets = new Map<string, BuildResult>();
  private readonly idempotency = new Map<string, string>();

  constructor(opts: CreativeAgentOptions = {}) {
    this.agentUrl = opts.agentUrl ?? DEFAULT_AGENT_URL;
    this.rt = opts.runtime ?? systemRuntime();
    this.cdnBase = opts.cdnBase ?? "https://cdn.pinnacle-agency.com";
    this.store.seedFormats(opts.formats ?? SEED_FORMATS);
  }

  /** list_creative_formats — what this creative agent can produce. */
  listCreativeFormats(input?: { type?: string }): { formats: CreativeFormat[] } {
    let formats = this.store.listFormats();
    if (input?.type) formats = formats.filter((f) => f.type === input.type);
    return { formats };
  }

  /**
   * build_creative — generate a creative for every target format from one
   * brief. Supports refinement via `refine_of`, threading the prior brief so
   * successive calls read as a conversation.
   */
  buildCreative(input: unknown): BuildResult {
    const req = parseOrThrow(BuildCreativeRequest, input, "build_creative request");

    if (req.idempotency_key && this.idempotency.has(req.idempotency_key)) {
      return this.sets.get(this.idempotency.get(req.idempotency_key)!)!;
    }

    const prior = req.refine_of ? this.sets.get(req.refine_of) : undefined;
    if (req.refine_of && !prior) throw AdcpError.notFound(`Creative set ${req.refine_of}`);

    const brief = prior ? `${prior.brief} | refine: ${req.message}` : req.message;
    const setId = this.rt.ids.next("cset");

    const creatives: Creative[] = req.target_format_ids.map((fid) => {
      const format = this.store.formats.get(fid.id);
      if (!format) throw AdcpError.notFound(`Format ${fid.id}`);
      return this.generateCreative(setId, brief, req.brand, fid, format);
    });

    const result: BuildResult = { creative_set_id: setId, brief, creatives };
    this.sets.set(setId, result);
    for (const c of creatives) this.store.creatives.set(c.creative_id, c);
    if (req.idempotency_key) this.idempotency.set(req.idempotency_key, setId);
    return result;
  }

  /** list_creatives — the agent's creative library. */
  listCreatives(input?: { format_id?: string }): { creatives: Creative[] } {
    let creatives = this.store.listCreatives();
    if (input?.format_id) creatives = creatives.filter((c) => c.format_id.id === input.format_id);
    return { creatives };
  }

  /** Retrieve a previously built creative set. */
  getSet(setId: string): BuildResult {
    const set = this.sets.get(setId);
    if (!set) throw AdcpError.notFound(`Creative set ${setId}`);
    return set;
  }

  /**
   * Package creatives for sync_creatives on a seller. Returns the minimal
   * shape a sales agent's sync_creatives expects.
   */
  toSyncPayload(setId: string, brand?: Brand) {
    const set = this.getSet(setId);
    return {
      creatives: set.creatives.map((c) => ({
        creative_id: c.creative_id,
        name: c.name,
        format_id: c.format_id,
        assets: c.assets,
        brand: c.brand ?? brand,
      })),
    };
  }

  /* -------------------------------------------------------------- */
  /* Generation                                                     */
  /* -------------------------------------------------------------- */

  private generateCreative(
    setId: string,
    brief: string,
    brand: Brand | undefined,
    fid: FormatId,
    format: CreativeFormat,
  ): Creative {
    const slug = brand?.domain?.split(".")[0] ?? "brand";
    const name = `${titleize(slug)} — ${format.name}`;
    const assets = this.synthesizeAssets(setId, slug, brief, format);
    const now = this.rt.clock.isoNow();
    return {
      creative_id: this.rt.ids.next("cr"),
      name,
      format_id: fid,
      assets,
      brand,
      status: "approved", // self-produced; downstream seller re-reviews on sync
      created_at: now,
      updated_at: now,
    };
  }

  /** Produce format-appropriate assets that satisfy the format's specs. */
  private synthesizeAssets(
    setId: string,
    slug: string,
    brief: string,
    format: CreativeFormat,
  ): Record<string, CreativeAsset> {
    const headline = deriveHeadline(brief);
    const base = `${this.cdnBase}/${slug}/${setId}/${format.id}`;

    switch (format.type) {
      case "video":
        return {
          video: {
            asset_type: "video",
            url: `${base}.mp4`,
            width: format.width,
            height: format.height,
            duration_ms: format.duration_ms,
            mime_type: pickMime(format, "video/mp4"),
            file_size_bytes: Math.min(format.max_file_size_bytes ?? 20_000_000, 12_000_000),
          },
          headline: { asset_type: "text", text: headline },
        };
      case "audio":
        return {
          audio: {
            asset_type: "audio",
            url: `${base}.mp3`,
            duration_ms: format.duration_ms,
            mime_type: pickMime(format, "audio/mpeg"),
            file_size_bytes: Math.min(format.max_file_size_bytes ?? 4_000_000, 2_500_000),
          },
          script: { asset_type: "text", text: headline },
        };
      case "display":
        return {
          image: {
            asset_type: "image",
            url: `${base}.png`,
            width: format.width,
            height: format.height,
            mime_type: pickMime(format, "image/png"),
            file_size_bytes: Math.min(format.max_file_size_bytes ?? 200_000, 140_000),
          },
          headline: { asset_type: "text", text: headline },
          click_url: { asset_type: "url", url: `https://${slug}.com` },
        };
      case "native":
      default:
        return {
          title: { asset_type: "text", text: headline },
          image: {
            asset_type: "image",
            url: `${base}.png`,
            width: format.width ?? 1200,
            height: format.height ?? 627,
            mime_type: "image/png",
          },
          click_url: { asset_type: "url", url: `https://${slug}.com` },
        };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function pickMime(format: CreativeFormat, fallback: string): string {
  return format.accepts.find((m) => m !== "text/html") ?? fallback;
}

function deriveHeadline(brief: string): string {
  const cleaned = brief.replace(/\|\s*refine:.*$/i, "").trim();
  const words = cleaned.split(/\s+/).slice(0, 8).join(" ");
  return words.length ? capitalize(words) : "Discover more";
}

function titleize(s: string): string {
  return s
    .split(/[-_]/)
    .map(capitalize)
    .join(" ");
}
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
