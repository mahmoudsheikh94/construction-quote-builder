import { describe, it, expect } from "vitest";
import { evaluateCostModel, MissingPriceKeyError } from "@/lib/domain/cost-engine";
import type { CostModel } from "@/lib/domain/skill-schema";
import type { PriceSnapshot } from "@/lib/domain/types";

const tiling: CostModel = {
  id: "tiling.ceramic_floor",
  labelAr: "بلاط سيراميك أرضيات",
  unit: "m2",
  keywords: ["سيراميك"],
  components: [
    { id: "tile", kind: "material", labelAr: "بلاط", priceBookKey: "ceramic_tile_m2", qtyPerUnit: "1" },
    { id: "mortar", kind: "material", labelAr: "مونة", priceBookKey: "mortar_m2", qtyPerUnit: "1" },
    { id: "tiler", kind: "labor", labelAr: "مبلط", priceBookKey: "tiler_day_rate", productivityPerDay: "15" },
  ],
  wastePct: "5",
  markupPct: "15",
};

const snapshot: PriceSnapshot = {
  ceramic_tile_m2: { priceFils: 8000, entryId: "e1", effectiveDate: "2026-07-01", unit: "m2" },
  mortar_m2: { priceFils: 1500, entryId: "e2", effectiveDate: "2026-07-01", unit: "m2" },
  tiler_day_rate: { priceFils: 25000, entryId: "e3", effectiveDate: "2026-07-01", unit: "day" },
};

describe("evaluateCostModel", () => {
  it("prices ceramic tiling to the fils, deterministically", () => {
    const b = evaluateCostModel(tiling, snapshot);
    expect(b.materialFils).toBe(9500);          // 8000 + 1500
    expect(b.wasteFils).toBe(475);              // 5% of 9500
    expect(b.laborFils).toBe(1667);             // 25000 / 15 = 1666.67 → 1667
    expect(b.equipmentFils).toBe(0);
    expect(b.markupFils).toBe(1746);            // 15% of 11642 = 1746.3 → 1746
    expect(b.rateFils).toBe(13388);
    expect(b.priceEntryIds.ceramic_tile_m2).toBe("e1");
  });

  it("is exactly reproducible (same inputs, same output)", () => {
    expect(evaluateCostModel(tiling, snapshot)).toEqual(evaluateCostModel(tiling, snapshot));
  });

  it("throws MissingPriceKeyError for absent price keys", () => {
    expect(() => evaluateCostModel(tiling, { ...snapshot, tiler_day_rate: undefined as never }))
      .toThrow(MissingPriceKeyError);
  });
});
