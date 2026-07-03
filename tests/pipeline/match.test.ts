import { describe, it, expect } from "vitest";
import { matchLine } from "@/lib/pipeline/match";
import { recordTagging } from "@/lib/db/corpus";
import { makeAdapter } from "@/lib/ai/adapter";
import type { SkillContent } from "@/lib/domain/skill-schema";

const skill: SkillContent = {
  trade: "tiling",
  costModels: [{
    id: "tiling.ceramic_floor", labelAr: "بلاط سيراميك", unit: "m2", keywords: ["سيراميك", "بلاط"],
    components: [{ id: "t", kind: "material", labelAr: "بلاط", priceBookKey: "ceramic_tile_m2", qtyPerUnit: "1" }],
    wastePct: "5", markupPct: "15",
  }],
};

describe("matchLine", () => {
  it("returns a deterministic match when the corpus already knows the signature", async () => {
    const trade = `tiling_${Date.now()}`;
    const tags = { material: "ceramic", dimensions: "60x60", category: "floor" };
    await recordTagging({ trade, rawText: "بلاط سيراميك", tags, costModelId: "tiling.ceramic_floor" });
    // adapter should NOT be called on a deterministic hit — inject one that throws if used.
    const adapter = makeAdapter(async () => { throw new Error("must not call AI on deterministic hit"); });
    const r = await matchLine(adapter, trade, tags, { ...skill, trade }, "بلاط سيراميك");
    expect(r).toMatchObject({ costModelId: "tiling.ceramic_floor", method: "deterministic", confidence: 1 });
  });

  it("falls back to a semantic match via the adapter when the corpus is empty", async () => {
    const trade = `tiling_${Date.now()}_2`;
    const adapter = makeAdapter(async () => '{"costModelId":"tiling.ceramic_floor","confidence":0.8}');
    const r = await matchLine(adapter, trade, { material: "porcelain", category: "floor" }, { ...skill, trade }, "بورسلان أرضيات");
    expect(r).toMatchObject({ costModelId: "tiling.ceramic_floor", method: "semantic" });
    expect(r?.confidence).toBeCloseTo(0.8);
  });

  it("returns null when the semantic matcher declines (no fitting model)", async () => {
    const trade = `tiling_${Date.now()}_3`;
    const adapter = makeAdapter(async () => '{"costModelId":null,"confidence":0}');
    const r = await matchLine(adapter, trade, { material: "mystery" }, { ...skill, trade }, "شيء غريب");
    expect(r).toBeNull();
  });
});
