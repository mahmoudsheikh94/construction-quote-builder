import { describe, it, expect } from "vitest";
import { validateUnit, validateBand, checkRatios } from "@/lib/domain/validation";
import { buildRollup } from "@/lib/domain/rollup";

describe("validateUnit", () => {
  it("flags unknown item unit", () => {
    expect(validateUnit(null, "m2")[0].code).toBe("UNIT_UNKNOWN");
  });
  it("flags item/model unit mismatch as error", () => {
    const flags = validateUnit("m3", "m2");
    expect(flags[0].code).toBe("UNIT_MISMATCH");
    expect(flags[0].severity).toBe("error");
  });
  it("passes matching units", () => {
    expect(validateUnit("m2", "m2")).toEqual([]);
  });
});

describe("validateBand", () => {
  it("flags out-of-band rates as warning", () => {
    const flags = validateBand(20_000, { minRateFils: 8_000, maxRateFils: 18_000 });
    expect(flags[0].code).toBe("OUT_OF_BAND");
    expect(flags[0].severity).toBe("warning");
  });
  it("passes in-band and missing band", () => {
    expect(validateBand(13_388, { minRateFils: 8_000, maxRateFils: 18_000 })).toEqual([]);
    expect(validateBand(999_999, undefined)).toEqual([]);
  });
});

describe("checkRatios", () => {
  it("warns when a section's share of grand total is out of expected range", () => {
    const rollup = buildRollup([
      { sectionRef: "2", amountFils: 900_000 },  // 90% — concrete way too dominant
      { sectionRef: "5", amountFils: 100_000 },
    ]);
    const flags = checkRatios(rollup, [
      { sectionMatch: "2", minPct: 20, maxPct: 45, labelAr: "الأعمال الخرسانية" },
    ]);
    expect(flags[0].code).toBe("RATIO_WARNING");
  });
});
