import { describe, it, expect } from "vitest";
import { CreativeAgent } from "./creative-agent.js";
import { deterministicRuntime } from "../core/runtime.js";

function make(): CreativeAgent {
  return new CreativeAgent({ runtime: deterministicRuntime() });
}

const fmt = (id: string) => ({ agent_url: "https://ads.streamhaus.tv", id });

describe("CreativeAgent build_creative", () => {
  it("builds one creative per target format with valid assets", () => {
    const agent = make();
    const set = agent.buildCreative({
      message: "Adventurous summer campaign for outdoor gear",
      brand: { domain: "acmeoutdoor.com" },
      target_format_ids: [fmt("video_16x9_30s"), fmt("display_300x250"), fmt("audio_30s")],
    });
    expect(set.creatives).toHaveLength(3);
    const video = set.creatives.find((c) => c.format_id.id === "video_16x9_30s")!;
    expect(video.assets.video?.duration_ms).toBe(30000);
    expect(video.assets.video?.width).toBe(1920);
    const display = set.creatives.find((c) => c.format_id.id === "display_300x250")!;
    expect(display.assets.image?.width).toBe(300);
  });

  it("built creatives pass the sales agent's review", async () => {
    const { SalesAgent } = await import("./sales-agent.js");
    const creative = make();
    const sales = new SalesAgent({ runtime: deterministicRuntime() });
    const set = creative.buildCreative({
      message: "Summer",
      brand: { domain: "acme.com" },
      target_format_ids: [fmt("display_300x250"), fmt("video_16x9_30s"), fmt("audio_30s")],
    });
    const synced = sales.syncCreatives(creative.toSyncPayload(set.creative_set_id, { domain: "acme.com" }));
    expect(synced.creatives.every((c) => c.status === "approved")).toBe(true);
  });

  it("supports conversational refinement via refine_of", () => {
    const agent = make();
    const first = agent.buildCreative({ message: "Summer outdoor", target_format_ids: [fmt("display_300x250")] });
    const refined = agent.buildCreative({
      message: "Make the hero shot hiking boots",
      refine_of: first.creative_set_id,
      target_format_ids: [fmt("display_300x250")],
    });
    expect(refined.brief).toMatch(/refine:/);
    expect(refined.creative_set_id).not.toBe(first.creative_set_id);
  });

  it("is idempotent on idempotency_key", () => {
    const agent = make();
    const req = { idempotency_key: "k1", message: "x", target_format_ids: [fmt("display_300x250")] };
    const a = agent.buildCreative(req);
    const b = agent.buildCreative(req);
    expect(a.creative_set_id).toBe(b.creative_set_id);
  });

  it("throws on unknown format", () => {
    const agent = make();
    expect(() => agent.buildCreative({ message: "x", target_format_ids: [fmt("nope")] })).toThrow(/not found/);
  });
});
