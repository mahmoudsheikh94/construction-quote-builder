import { describe, it, expect } from "vitest";
import { applyLocationFactor, applyTimeIndex, burdenNumFromOverrides } from "@/lib/domain/overrides";
import type { PriceSnapshot } from "@/lib/domain/types";

const snap: PriceSnapshot = {
  labor_day: { priceFils: 25000, entryId: "e1", effectiveDate: "2026-01-01", unit: "day", referenceLocation: null },
  tile_m2: { priceFils: 8000, entryId: "e2", effectiveDate: "2026-01-01", unit: "m2", referenceLocation: null },
  crane_day: { priceFils: 40000, entryId: "e3", effectiveDate: "2026-01-01", unit: "day", referenceLocation: null },
};

describe("applyLocationFactor", () => {
  it("scales labor by labor index, material + equipment by material index", () => {
    const out = applyLocationFactor(snap, ["labor_day"], ["tile_m2"], ["crane_day"], {
      locationFactor: { labor: "1.20", material: "1.10" },
    });
    expect(out.labor_day.priceFils).toBe(30000); // 25000 * 1.20
    expect(out.tile_m2.priceFils).toBe(8800); // 8000 * 1.10
    expect(out.crane_day.priceFils).toBe(44000); // equipment uses material index: 40000 * 1.10
  });
  it("is identity when locationFactor absent", () => {
    expect(applyLocationFactor(snap, ["labor_day"], ["tile_m2"], [], {})).toEqual(snap);
  });
});

describe("applyTimeIndex", () => {
  it("scales every entry by index@target / index@baseDate", () => {
    const out = applyTimeIndex(snap, { "2026-01-01": 100, "2027-01-01": 103 }, { targetDate: "2027-01-01" });
    expect(out.labor_day.priceFils).toBe(25750); // 25000 * 103/100
  });
  it("is identity when targetDate absent", () => {
    expect(applyTimeIndex(snap, { "2026-01-01": 100 }, {})).toEqual(snap);
  });
});

describe("burdenNumFromOverrides", () => {
  it("returns the integer percent, or 0n when absent", () => {
    expect(burdenNumFromOverrides({ laborBurdenPct: "30" })).toBe(30n);
    expect(burdenNumFromOverrides({})).toBe(0n);
    expect(burdenNumFromOverrides(undefined)).toBe(0n);
  });
});
