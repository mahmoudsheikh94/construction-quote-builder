import { describe, it, expect } from "vitest";
import { applySizeFactorToModel } from "@/lib/domain/overrides";
import type { CostModel } from "@/lib/domain/skill-schema";

const model: CostModel = {
  id: "m", labelAr: "x", unit: "m2", keywords: [], wastePct: "0", markupPct: "0",
  components: [
    { id: "c1", kind: "material", labelAr: "m", priceBookKey: "k1", qtyPerUnit: "2" },
    { id: "c2", kind: "labor", labelAr: "l", priceBookKey: "k2", productivityPerDay: "10" },
    { id: "c3", kind: "equipment", labelAr: "e", priceBookKey: "k3", qtyPerUnit: "4" },
  ],
};

describe("applySizeFactorToModel", () => {
  it("scales material + equipment qtyPerUnit by sizeFactor, leaves labor untouched", () => {
    const out = applySizeFactorToModel(model, "0.90");
    expect(out.components[0].qtyPerUnit).toBe("1.8"); // material: 2 * 0.90
    expect(out.components[2].qtyPerUnit).toBe("3.6"); // equipment: 4 * 0.90
    expect(out.components[1].productivityPerDay).toBe("10"); // labor unchanged
  });
  it("is identity when sizeFactor absent", () => {
    expect(applySizeFactorToModel(model, undefined)).toBe(model);
  });
});
