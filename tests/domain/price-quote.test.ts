import { describe, it, expect } from "vitest";
import { priceQuote } from "@/lib/domain/price-quote";
import type { SkillContent } from "@/lib/domain/skill-schema";
import type { PriceSnapshot } from "@/lib/domain/types";

const tilingSkill: SkillContent = {
  trade: "tiling",
  costModels: [{
    id: "tiling.ceramic_floor", labelAr: "بلاط سيراميك", unit: "m2", keywords: [],
    components: [
      { id: "tile", kind: "material", labelAr: "بلاط", priceBookKey: "ceramic_tile_m2", qtyPerUnit: "1" },
      { id: "mortar", kind: "material", labelAr: "مونة", priceBookKey: "mortar_m2", qtyPerUnit: "1" },
      { id: "tiler", kind: "labor", labelAr: "مبلط", priceBookKey: "tiler_day_rate", productivityPerDay: "15" },
    ],
    wastePct: "5", markupPct: "15",
    band: { minRateFils: 8_000, maxRateFils: 18_000 },
  }],
};

const snapshot: PriceSnapshot = {
  ceramic_tile_m2: { priceFils: 8000, entryId: "e1", effectiveDate: "2026-07-01", unit: "m2" },
  mortar_m2: { priceFils: 1500, entryId: "e2", effectiveDate: "2026-07-01", unit: "m2" },
  tiler_day_rate: { priceFils: 25000, entryId: "e3", effectiveDate: "2026-07-01", unit: "day" },
};

const skills = { tiling: { content: tilingSkill, versionId: "sv1" } };
const match = { trade: "tiling", costModelId: "tiling.ceramic_floor", method: "deterministic" as const, confidence: 0.95 };

describe("priceQuote", () => {
  it("prices a clean deterministic match with full provenance, no flags", () => {
    const { lines, rollup } = priceQuote({
      items: [{ id: "i1", sectionRef: "5", itemType: "unit_rate", unitCanonical: "m2", quantityThousandths: 2_700_000, match }],
      skills, snapshot,
    });
    expect(lines[0].rateFils).toBe(13_388);
    expect(lines[0].amountFils).toBe(36_147_600);   // 2700 × 13.388
    expect(lines[0].flags).toEqual([]);
    expect(lines[0].provenance.skillVersionId).toBe("sv1");
    expect(rollup.grandTotalFils).toBe(36_147_600);
  });

  it("adds SEMANTIC_FALLBACK warning for semantic matches (still priced)", () => {
    const { lines } = priceQuote({
      items: [{ id: "i1", sectionRef: "5", itemType: "unit_rate", unitCanonical: "m2", quantityThousandths: 1_000, match: { ...match, method: "semantic" } }],
      skills, snapshot,
    });
    expect(lines[0].rateFils).toBe(13_388);
    expect(lines[0].flags.map((f) => f.code)).toContain("SEMANTIC_FALLBACK");
  });

  it("hard-stops unit mismatch: no price, error flag", () => {
    const { lines } = priceQuote({
      items: [{ id: "i1", sectionRef: "5", itemType: "unit_rate", unitCanonical: "m3", quantityThousandths: 1_000, match }],
      skills, snapshot,
    });
    expect(lines[0].rateFils).toBeNull();
    expect(lines[0].flags.map((f) => f.code)).toContain("UNIT_MISMATCH");
  });

  it("degrades missing price key to a flag, never throws", () => {
    const { lines } = priceQuote({
      items: [{ id: "i1", sectionRef: "5", itemType: "unit_rate", unitCanonical: "m2", quantityThousandths: 1_000, match }],
      skills,
      snapshot: { ceramic_tile_m2: snapshot.ceramic_tile_m2, mortar_m2: snapshot.mortar_m2 } as PriceSnapshot,
    });
    expect(lines[0].rateFils).toBeNull();
    expect(lines[0].flags.map((f) => f.code)).toContain("MISSING_PRICE_KEY");
  });

  it("passes provisional sums through with given amounts; flags dayworks as manual", () => {
    const { lines } = priceQuote({
      items: [
        { id: "ps", sectionRef: "PS", itemType: "provisional_sum", unitCanonical: "ls", quantityThousandths: null, givenAmountFils: 402_600_000, match: null },
        { id: "dw", sectionRef: "DW", itemType: "dayworks", unitCanonical: "day", quantityThousandths: null, match: null },
      ],
      skills, snapshot,
    });
    expect(lines[0].amountFils).toBe(402_600_000);
    expect(lines[0].flags).toEqual([]);
    expect(lines[1].amountFils).toBeNull();
    expect(lines[1].flags.map((f) => f.code)).toContain("NEEDS_MANUAL");
  });

  it("applies overrides before pricing (markup + labor premium)", () => {
    const { lines } = priceQuote({
      items: [{ id: "i1", sectionRef: "5", itemType: "unit_rate", unitCanonical: "m2", quantityThousandths: 1_000, match }],
      skills, snapshot,
      overrides: { markupPctByTrade: { tiling: "20" }, laborPremiumPct: "20" },
    });
    // labor premium: tiler 25000 → 30000; labor 30000/15 = 2000
    // base = 9500 + 475 + 2000 = 11975; markup 20% = 2395; rate = 14370
    expect(lines[0].rateFils).toBe(14_370);
  });

  it("emits project-level ratio warnings", () => {
    const { projectFlags } = priceQuote({
      items: [{ id: "i1", sectionRef: "5", itemType: "unit_rate", unitCanonical: "m2", quantityThousandths: 2_700_000, match }],
      skills, snapshot,
      ratioChecks: [{ sectionMatch: "5", minPct: 1, maxPct: 30, labelAr: "أعمال البلاط" }],
    });
    expect(projectFlags.map((f) => f.code)).toContain("RATIO_WARNING"); // 100% > 30%
  });
});
