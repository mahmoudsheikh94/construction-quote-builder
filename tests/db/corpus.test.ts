import { describe, it, expect } from "vitest";
import { tagSignature, recordTagging, lookupBySignature } from "@/lib/db/corpus";

describe("corpus", () => {
  it("builds a stable signature regardless of tag key order", () => {
    const a = tagSignature("tiling", { material: "ceramic", grade: "A", category: "floor" });
    const b = tagSignature("tiling", { category: "floor", grade: "A", material: "ceramic" });
    expect(a).toBe(b);
  });

  it("records a tagging + resolved model, then looks it up by signature", async () => {
    const trade = `tiling_${Date.now()}`;
    const tags = { material: "ceramic", dimensions: "60x60", category: "floor" };
    await recordTagging({ trade, rawText: "بلاط سيراميك 60x60", tags, costModelId: "tiling.ceramic_floor" });
    const hit = await lookupBySignature(trade, tags);
    expect(hit?.costModelId).toBe("tiling.ceramic_floor");
    expect(hit?.hitCount).toBeGreaterThanOrEqual(1);
  });

  it("returns null when no prior match exists for the signature", async () => {
    expect(await lookupBySignature(`novel_${Date.now()}`, { material: "unobtanium" })).toBeNull();
  });
});
