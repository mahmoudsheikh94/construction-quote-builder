import { describe, it, expect } from "vitest";
import { CostModelSchema } from "@/lib/domain/skill-schema";

describe("CostModelSchema Phase-B fields", () => {
  const legacy = {
    id: "m1", labelAr: "x", unit: "m2", keywords: [], wastePct: "5", markupPct: "15",
    components: [{ id: "c1", kind: "material", labelAr: "y", priceBookKey: "k", qtyPerUnit: "1" }],
  };

  it("validates legacy content unchanged", () => {
    expect(CostModelSchema.parse(legacy).markupPct).toBe("15");
  });

  it("accepts overheadPct / profitPct / materialCategory", () => {
    const withSplit = {
      ...legacy, overheadPct: "12", profitPct: "8",
      components: [{ ...legacy.components[0], materialCategory: "tile" }],
    };
    const parsed = CostModelSchema.parse(withSplit);
    expect(parsed.overheadPct).toBe("12");
    expect(parsed.profitPct).toBe("8");
    expect(parsed.components[0].materialCategory).toBe("tile");
  });
});
