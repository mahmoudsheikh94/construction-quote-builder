import { describe, it, expect } from "vitest";
import { assembleAndPrice } from "@/lib/pipeline/assemble";
import type { SkillContent } from "@/lib/domain/skill-schema";
import type { PriceSnapshot } from "@/lib/domain/types";
import type { MatchedItem } from "@/lib/domain/price-quote";

// The new optional `overrides` param on assembleAndPrice must be inert by default:
// passing overrides:undefined must equal omitting it entirely.
const skill: SkillContent = {
  trade: "tiling",
  costModels: [{
    id: "tiling.ceramic_floor", labelAr: "بلاط", unit: "m2", keywords: [],
    components: [{ id: "tiler", kind: "labor", labelAr: "مبلط", priceBookKey: "tiler_rate", productivityPerDay: "15" }],
    wastePct: "5", markupPct: "15",
  }],
};
const snapshot: PriceSnapshot = {
  tiler_rate: { priceFils: 25000, entryId: "e", effectiveDate: "2026-07-01", unit: "day" },
};
const items: MatchedItem[] = [{
  id: "i1", sectionRef: "5", itemType: "unit_rate", unitCanonical: "m2", quantityThousandths: 1_000_000,
  match: { trade: "tiling", costModelId: "tiling.ceramic_floor", method: "deterministic", confidence: 1 },
}];
const skills = { tiling: { content: skill, versionId: "v" } };

describe("assembleAndPrice overrides is inert by default", () => {
  it("overrides:undefined equals omitting the key", () => {
    const withKey = assembleAndPrice({ items, skills, snapshot, overrides: undefined });
    const without = assembleAndPrice({ items, skills, snapshot });
    expect(withKey.rollup.grandTotalFils).toBe(without.rollup.grandTotalFils);
    expect(withKey.rollup.grandTotalFils).toBeGreaterThan(0);
  });
});
