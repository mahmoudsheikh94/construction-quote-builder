import { describe, it, expect } from "vitest";
import { repriceCore, matchedItemsFromRows } from "@/lib/domain/reprice-core";
import type { SkillContent } from "@/lib/domain/skill-schema";
import type { PriceSnapshot } from "@/lib/domain/types";
import type { MatchedItem } from "@/lib/domain/price-quote";

const skill: SkillContent = {
  trade: "tiling",
  costModels: [{
    id: "tiling.floor", labelAr: "بلاط", unit: "m2", keywords: [],
    components: [
      { id: "tiler", kind: "labor", labelAr: "مبلط", priceBookKey: "tiler_day", productivityPerDay: "15" },
      { id: "tile", kind: "material", labelAr: "بلاط", priceBookKey: "tile_m2", qtyPerUnit: "1" },
    ],
    wastePct: "0", markupPct: "0",
  }],
};
const snapshot: PriceSnapshot = {
  tiler_day: { priceFils: 25000, entryId: "e1", effectiveDate: "2026-01-01", unit: "day", referenceLocation: null },
  tile_m2: { priceFils: 8000, entryId: "e2", effectiveDate: "2026-01-01", unit: "m2", referenceLocation: null },
};
const items: MatchedItem[] = [{
  id: "i1", sectionRef: "1", itemType: "unit_rate", unitCanonical: "m2", quantityThousandths: 1_000_000,
  match: { trade: "tiling", costModelId: "tiling.floor", method: "deterministic", confidence: 1 },
}];
const skills = { tiling: { content: skill, versionId: "v" } };

describe("repriceCore", () => {
  it("applies burden + location to the reprice", () => {
    // base labor 25000/15 = 1667 + material 8000 = 9667.
    const plain = repriceCore({ items, skills, snapshot });
    expect(plain[0].rateFils).toBe(9667);

    // burden 30% (labor -> 2167) + location labor 1.2 (25000*1.2=30000 -> /15 -> *1.3 burden):
    // labor = 30000*130*1e6*1e6 / (15e6*100*1e6) = 30000*130/1500 = 2600 ; material 8000*1.1 = 8800 -> 11400
    const adj = repriceCore({
      items, skills, snapshot,
      overrides: { laborBurdenPct: "30", locationFactor: { labor: "1.2", material: "1.1" } },
    });
    expect(adj[0].rateFils).toBe(11400);
  });
});

describe("matchedItemsFromRows", () => {
  it("reconstructs MatchedItem from a stored line_items row", () => {
    const mi = matchedItemsFromRows([{
      id: "x", section_ref: "5", item_type: "unit_rate", unit_canonical: "m2",
      quantity_thousandths: 2000, match: { trade: "tiling", costModelId: "tiling.floor", method: "deterministic", confidence: 1 },
    }]);
    expect(mi[0].id).toBe("x");
    expect(mi[0].quantityThousandths).toBe(2000);
    expect(mi[0].match?.trade).toBe("tiling");
  });
});
