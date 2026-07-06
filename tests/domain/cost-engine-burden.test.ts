import { describe, it, expect } from "vitest";
import { evaluateCostModel } from "@/lib/domain/cost-engine";
import type { CostModel } from "@/lib/domain/skill-schema";
import type { PriceSnapshot } from "@/lib/domain/types";

// Same fixture as tests/domain/cost-engine.test.ts (labor 25000/day, productivity 15).
const tiling: CostModel = {
  id: "tiling.ceramic_floor", labelAr: "بلاط", unit: "m2", keywords: [],
  components: [
    { id: "tile", kind: "material", labelAr: "بلاط", priceBookKey: "ceramic_tile_m2", qtyPerUnit: "1" },
    { id: "mortar", kind: "material", labelAr: "مونة", priceBookKey: "mortar_m2", qtyPerUnit: "1" },
    { id: "tiler", kind: "labor", labelAr: "مبلط", priceBookKey: "tiler_day_rate", productivityPerDay: "15" },
  ],
  wastePct: "5", markupPct: "15",
};
const snapshot: PriceSnapshot = {
  ceramic_tile_m2: { priceFils: 8000, entryId: "e1", effectiveDate: "2026-07-01", unit: "m2" },
  mortar_m2: { priceFils: 1500, entryId: "e2", effectiveDate: "2026-07-01", unit: "m2" },
  tiler_day_rate: { priceFils: 25000, entryId: "e3", effectiveDate: "2026-07-01", unit: "day" },
};

describe("evaluateCostModel burden (opts.burdenNum)", () => {
  it("burdenNum=0 reproduces the current identity (laborFils 1667)", () => {
    expect(evaluateCostModel(tiling, snapshot, { burdenNum: 0n }).laborFils).toBe(1667);
  });
  it("2-arg call is unchanged (backward-compat lock)", () => {
    const b = evaluateCostModel(tiling, snapshot);
    expect(b.laborFils).toBe(1667);
    expect(b.rateFils).toBe(13388);
  });
  it("burdenNum=30 raises labor by exactly 30%, one rounding", () => {
    // 25000*130*1e6*1e6 / (15e6*100*1e6) = 25000*130/1500 = 2166.67 -> 2167
    const b = evaluateCostModel(tiling, snapshot, { burdenNum: 30n });
    expect(b.laborFils).toBe(2167);
    expect(b.materialFils).toBe(9500); // unchanged
  });
});

describe("evaluateCostModel L (opts.L)", () => {
  it("L=1.20 slows labor by 20%, one rounding", () => {
    // 25000*100*1e6*1.2e6 / (15e6*100*1e6) = 25000*1.2/15 = 2000
    expect(evaluateCostModel(tiling, snapshot, { L: 1_200_000n }).laborFils).toBe(2000);
  });
  it("burden 30% AND L 1.20 compose in one division", () => {
    // 25000*130*1.2e6*1e6 / (15e6*100*1e6) = 25000*130*1.2/1500 = 2600
    expect(evaluateCostModel(tiling, snapshot, { burdenNum: 30n, L: 1_200_000n }).laborFils).toBe(2600);
  });
});

describe("evaluateCostModel overhead/profit split", () => {
  it("legacy markupPct-only model reprices identically", () => {
    expect(evaluateCostModel(tiling, snapshot).markupFils).toBe(1746);
  });
  it("overhead+profit compound: base*(1+oh)*(1+profit)", () => {
    // base = 9500+475+1667+0 = 11642 ; *1.12 -> 13039 ; *1.08 -> 14082
    const m = { ...tiling, markupPct: "0", overheadPct: "12", profitPct: "8" };
    const b = evaluateCostModel(m, snapshot);
    expect(b.rateFils).toBe(14082);
    expect(b.markupFils).toBe(14082 - 11642);
  });
});
