import { describe, it, expect } from "vitest";
import { applyLearnedProductivity } from "@/lib/domain/overrides";
import type { CostModel } from "@/lib/domain/skill-schema";

const model: CostModel = {
  id: "m1", labelAr: "x", unit: "m2", keywords: [], wastePct: "0", markupPct: "0",
  components: [
    { id: "c2", kind: "labor", labelAr: "l", priceBookKey: "k", productivityPerDay: "10" },
    { id: "c1", kind: "material", labelAr: "m", priceBookKey: "k2", qtyPerUnit: "1" },
  ],
};

describe("applyLearnedProductivity", () => {
  it("substitutes productivityPerDay from a learned norm, leaves others", () => {
    const out = applyLearnedProductivity(model, "tiling", {
      learnedProductivity: { "tiling:m1:c2": "12.5" },
    });
    expect(out.components[0].productivityPerDay).toBe("12.5");
    expect(out.components[1].qtyPerUnit).toBe("1"); // material untouched
  });
  it("is identity when no learned norm for the component", () => {
    expect(applyLearnedProductivity(model, "tiling", {})).toBe(model);
    expect(applyLearnedProductivity(model, "tiling", undefined)).toBe(model);
  });
});
