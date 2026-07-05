import { describe, it, expect } from "vitest";
import { priceQuote, type MatchedItem } from "@/lib/domain/price-quote";
import type { SkillContent } from "@/lib/domain/skill-schema";
import type { PriceSnapshot } from "@/lib/domain/types";
import type { ConditionSeedTables } from "@/lib/domain/productivity";

const skill: SkillContent = {
  trade: "tiling",
  costModels: [{
    id: "tiling.floor", labelAr: "بلاط", unit: "m2", keywords: [],
    components: [{ id: "tiler", kind: "labor", labelAr: "مبلط", priceBookKey: "tiler_day", productivityPerDay: "15" }],
    wastePct: "0", markupPct: "0",
  }],
};
const snapshot: PriceSnapshot = {
  tiler_day: { priceFils: 25000, entryId: "e", effectiveDate: "2026-01-01", unit: "day", referenceLocation: null },
};
const items: MatchedItem[] = [{
  id: "i1", sectionRef: "1", itemType: "unit_rate", unitCanonical: "m2", quantityThousandths: 1_000_000,
  match: { trade: "tiling", costModelId: "tiling.floor", method: "deterministic", confidence: 1 },
}];
const seed: ConditionSeedTables = {
  mcaa: { logistics: { minor: 10, average: 25, severe: 50 } },
  neca: [], overtimePi: {}, heightBands: [], floorBands: [], weatherBands: {}, shiftBands: {},
};

describe("priceQuote with conditions", () => {
  it("applies L to labor and records the breakdown sources", () => {
    const withL = priceQuote({
      items, skills: { tiling: { content: skill, versionId: "v" } }, snapshot,
      quoteConditions: { mode: "mcaa", mcaa: [{ key: "logistics", severity: "average" }] }, seedTables: seed,
    });
    const withoutL = priceQuote({ items, skills: { tiling: { content: skill, versionId: "v" } }, snapshot });

    // labor 25000/15 = 1667; with L=1.25 -> 1667*1.25 area (one rounding): 25000*1.25/15 = 2083.33 -> 2083
    expect(withoutL.lines[0].rateFils).toBe(1667);
    expect(withL.lines[0].rateFils).toBe(2083);
    expect(withL.lines[0].breakdown?.productivityLoss).toBe(1.25);
    expect(withL.lines[0].breakdown?.sources?.["mcaa:logistics"]).toBe(25);
  });
});
