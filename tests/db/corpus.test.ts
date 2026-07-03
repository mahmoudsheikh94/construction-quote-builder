import { describe, it, expect } from "vitest";
import { tagSignature, recordTagging, lookupBySignature, isEmptyTags } from "@/lib/db/corpus";

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

  it("never matches or records empty tags (would false-positive across untagged lines)", async () => {
    expect(isEmptyTags({})).toBe(true);
    expect(isEmptyTags({ standardRefs: [] })).toBe(true);
    expect(isEmptyTags({ material: "x" })).toBe(false);

    const trade = `empty_${Date.now()}`;
    // Recording a resolved match with empty tags must NOT create a fast-path row.
    await recordTagging({ trade, rawText: "بند بلا سمات", tags: {}, costModelId: "some.model" });
    // A later empty-tag line must NOT match that (or any) empty signature.
    expect(await lookupBySignature(trade, {})).toBeNull();
  });
});
