import { describe, it, expect } from "vitest";
import { checkScopeGap } from "@/lib/domain/scope-check";
import { checkSanityBand } from "@/lib/domain/sanity-band";

describe("checkScopeGap", () => {
  it("flags each required trade not covered", () => {
    const flags = checkScopeGap(new Set(["concrete", "rebar"]), ["concrete", "rebar", "plumbing", "electrical"]);
    expect(flags.map((f) => f.code)).toEqual(["SCOPE_GAP", "SCOPE_GAP"]);
    expect(flags[0].detail).toEqual({ requiredItem: "plumbing" });
  });
  it("no flags when all covered", () => {
    expect(checkScopeGap(new Set(["a", "b"]), ["a", "b"])).toEqual([]);
  });
});

describe("checkSanityBand", () => {
  const common = { totalKey: "__total__", tradeKey: (t: string) => t };
  it("skips all $/m2 checks when GFA is null (no null-divide)", () => {
    const flags = checkSanityBand({
      grossFloorAreaM2: null, tradeTotalsFils: { concrete: 999 }, grandTotalFils: 999,
      bands: new Map(), ...common,
    });
    expect(flags).toEqual([]);
  });
  it("flags a trade > 15% off its learned band", () => {
    // 100 m2, concrete total 200000 fils -> 2000 fils/m2 ; band 1000 -> 100% off
    const flags = checkSanityBand({
      grossFloorAreaM2: 100, tradeTotalsFils: { concrete: 200000 }, grandTotalFils: 200000,
      bands: new Map([["concrete", 1000]]), ...common,
    });
    expect(flags.some((f) => f.code === "SANITY_BAND")).toBe(true);
  });
  it("no flag when within 15%", () => {
    const flags = checkSanityBand({
      grossFloorAreaM2: 100, tradeTotalsFils: { concrete: 105000 }, grandTotalFils: 105000,
      bands: new Map([["concrete", 1000]]), ...common,
    });
    expect(flags).toEqual([]);
  });
});
