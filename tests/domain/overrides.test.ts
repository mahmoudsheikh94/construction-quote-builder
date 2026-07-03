import { describe, it, expect } from "vitest";
import { applyPriceOverrides, applyModelOverrides, applyLaborPremiumToSnapshot } from "@/lib/domain/overrides";
import type { CostModel } from "@/lib/domain/skill-schema";
import type { PriceSnapshot } from "@/lib/domain/types";

const model: CostModel = {
  id: "tiling.ceramic_floor", labelAr: "بلاط", unit: "m2", keywords: [],
  components: [{ id: "tile", kind: "material", labelAr: "بلاط", priceBookKey: "ceramic_tile_m2", qtyPerUnit: "1" }],
  wastePct: "5", markupPct: "15",
};

const snapshot: PriceSnapshot = {
  ceramic_tile_m2: { priceFils: 8000, entryId: "e1", effectiveDate: "2026-07-01", unit: "m2" },
};

describe("overrides", () => {
  it("overrides price book entries per project", () => {
    const out = applyPriceOverrides(snapshot, { priceBook: { ceramic_tile_m2: 9000 } });
    expect(out.ceramic_tile_m2.priceFils).toBe(9000);
    expect(snapshot.ceramic_tile_m2.priceFils).toBe(8000); // original untouched
  });

  it("respects markup precedence: model > trade > global > default", () => {
    expect(applyModelOverrides(model, "tiling", {}).markupPct).toBe("15");
    expect(applyModelOverrides(model, "tiling", { globalMarkupPct: "12" }).markupPct).toBe("12");
    expect(applyModelOverrides(model, "tiling", {
      globalMarkupPct: "12", markupPctByTrade: { tiling: "18" },
    }).markupPct).toBe("18");
    expect(applyModelOverrides(model, "tiling", {
      globalMarkupPct: "12", markupPctByTrade: { tiling: "18" },
      models: { "tiling.ceramic_floor": { markupPct: "20" } },
    }).markupPct).toBe("20");
  });

  it("returns inputs unchanged when no overrides given", () => {
    expect(applyModelOverrides(model, "tiling", undefined)).toEqual(model);
    expect(applyPriceOverrides(snapshot, undefined)).toEqual(snapshot);
  });

  it("applies labor premium to labor price-book keys only", () => {
    const snap: PriceSnapshot = {
      tiler_day_rate: { priceFils: 25000, entryId: "e3", effectiveDate: "2026-07-01", unit: "day" },
      ceramic_tile_m2: { priceFils: 8000, entryId: "e1", effectiveDate: "2026-07-01", unit: "m2" },
    };
    const out = applyLaborPremiumToSnapshot(snap, ["tiler_day_rate"], { laborPremiumPct: "20" });
    expect(out.tiler_day_rate.priceFils).toBe(30000);
    expect(out.ceramic_tile_m2.priceFils).toBe(8000);
  });
});
