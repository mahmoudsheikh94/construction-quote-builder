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
    expect(mi.id).toBe("5/4-0");
  });
  it("keeps duplicate itemCodes distinct by composing id with sortOrder", () => {
    // Real BOQs can have two rows sharing the same itemCode (e.g. "1/1" repeated).
    // The id must stay unique per raw line so downstream joins never collide.
    const a = toMatchedItem(
      { sortOrder: 0, itemCode: "1/1", sectionRef: "1", descriptionOriginal: "بند أول" },
      "unit_rate", null,
    );
    const b = toMatchedItem(
      { sortOrder: 1, itemCode: "1/1", sectionRef: "1", descriptionOriginal: "بند ثاني" },
      "unit_rate", null,
    );
    expect(a.id).toBe("1/1-0");
    expect(b.id).toBe("1/1-1");
    expect(a.id).not.toBe(b.id);
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
