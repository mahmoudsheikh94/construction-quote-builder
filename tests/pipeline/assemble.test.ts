import { describe, it, expect } from "vitest";
import { toMatchedItem, priceUnitMismatchFlags } from "@/lib/pipeline/assemble";
import type { SkillContent } from "@/lib/domain/skill-schema";
import type { PriceSnapshot } from "@/lib/domain/types";

describe("toMatchedItem", () => {
  it("normalizes unit + quantity and carries the match through", () => {
    const mi = toMatchedItem(
      { sortOrder: 0, itemCode: "5/4", sectionRef: "5", descriptionOriginal: "بلاط", unitRaw: "م2", quantityRaw: "2700" },
      "unit_rate",
      { trade: "tiling", costModelId: "tiling.ceramic_floor", method: "deterministic", confidence: 1 },
    );
    expect(mi.unitCanonical).toBe("m2");
    expect(mi.quantityThousandths).toBe(2_700_000);
    expect(mi.match?.costModelId).toBe("tiling.ceramic_floor");
  });
  it("yields null unit + null quantity when unparseable (downstream flags them)", () => {
    const mi = toMatchedItem(
      { sortOrder: 1, sectionRef: "9", descriptionOriginal: "بند غريب", unitRaw: "bananas", quantityRaw: "abc" },
      "unit_rate", null,
    );
    expect(mi.unitCanonical).toBeNull();
    expect(mi.quantityThousandths).toBeNull();
    expect(mi.match).toBeNull();
  });
});

describe("priceUnitMismatchFlags", () => {
  it("flags a labor component whose price-book entry unit is not day/hr", () => {
    const skill: SkillContent = {
      trade: "tiling",
      costModels: [{
        id: "tiling.ceramic_floor", labelAr: "بلاط", unit: "m2", keywords: [],
        components: [{ id: "tiler", kind: "labor", labelAr: "مبلط", priceBookKey: "tiler_rate", productivityPerDay: "15" }],
        wastePct: "5", markupPct: "15",
      }],
    };
    const snapshot: PriceSnapshot = {
      tiler_rate: { priceFils: 25000, entryId: "e", effectiveDate: "2026-07-01", unit: "m2" }, // WRONG: labor priced per m2
    };
    const items = [{ id: "i1", sectionRef: "5", itemType: "unit_rate" as const, unitCanonical: "m2" as const, quantityThousandths: 1000, match: { trade: "tiling", costModelId: "tiling.ceramic_floor", method: "deterministic" as const, confidence: 1 } }];
    const flags = priceUnitMismatchFlags(items, { tiling: { content: skill, versionId: "v" } }, snapshot);
    expect(flags.map((f) => f.code)).toContain("PRICE_UNIT_MISMATCH");
  });
  it("passes when labor entry is a day rate", () => {
    const skill: SkillContent = {
      trade: "tiling",
      costModels: [{ id: "m", labelAr: "x", unit: "m2", keywords: [], components: [{ id: "l", kind: "labor", labelAr: "l", priceBookKey: "k", productivityPerDay: "15" }], wastePct: "5", markupPct: "15" }],
    };
    const snapshot: PriceSnapshot = { k: { priceFils: 25000, entryId: "e", effectiveDate: "2026-07-01", unit: "day" } };
    const items = [{ id: "i1", sectionRef: "5", itemType: "unit_rate" as const, unitCanonical: "m2" as const, quantityThousandths: 1000, match: { trade: "tiling", costModelId: "m", method: "deterministic" as const, confidence: 1 } }];
    expect(priceUnitMismatchFlags(items, { tiling: { content: skill, versionId: "v" } }, snapshot)).toEqual([]);
  });
});
