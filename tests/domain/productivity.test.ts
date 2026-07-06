import { describe, it, expect } from "vitest";
import {
  computeLossMultiplier, TooManyMcaaFactors, UnconfirmedSevere,
} from "@/lib/domain/productivity";
import type { ConditionSeedTables } from "@/lib/domain/productivity";

const seed: ConditionSeedTables = {
  mcaa: {
    logistics: { minor: 10, average: 25, severe: 50 },
    stacking_of_trades: { minor: 10, average: 20, severe: 30 },
    a: { minor: 5, average: 10, severe: 20 },
    b: { minor: 5, average: 10, severe: 20 }, c: { minor: 5, average: 10, severe: 20 },
    d: { minor: 5, average: 10, severe: 20 }, e: { minor: 5, average: 10, severe: 20 },
    f: { minor: 5, average: 10, severe: 20 },
  },
  neca: Array.from({ length: 30 }, (_, i) => `r${i}`),
  overtimePi: {},
  heightBands: [{ minFt: 0, maxFt: 10, upliftPct: 0 }, { minFt: 10, maxFt: 20, upliftPct: 25 }, { minFt: 20, maxFt: null, upliftPct: 50 }],
  floorBands: [{ minFloors: 3, maxFloors: 6, upliftPct: 1 }],
  weatherBands: { outdoor_hot: 50 },
  shiftBands: {},
};
const nall = (v: 1 | 2 | 3) => Object.fromEntries(seed.neca.map((k) => [k, v]));

describe("MCAA branch", () => {
  it("sums factors additively into L (not compounded)", () => {
    const r = computeLossMultiplier(
      { mode: "mcaa", mcaa: [{ key: "logistics", severity: "average" }, { key: "stacking_of_trades", severity: "minor" }] },
      null, seed,
    );
    expect(r.lMicro).toBe(1_350_000n); // 25% + 10% = 35%
    expect(r.breakdown.productivityLoss).toBe(1.35);
  });
  it("throws on more than 5 factors", () => {
    const six = ["a", "b", "c", "d", "e", "f"].map((key) => ({ key, severity: "minor" as const }));
    expect(() => computeLossMultiplier({ mode: "mcaa", mcaa: six }, null, seed)).toThrow(TooManyMcaaFactors);
  });
  it("throws on unconfirmed severe; computes when confirmed", () => {
    expect(() => computeLossMultiplier({ mode: "mcaa", mcaa: [{ key: "a", severity: "severe" }] }, null, seed)).toThrow(UnconfirmedSevere);
    const r = computeLossMultiplier({ mode: "mcaa", mcaa: [{ key: "a", severity: "severe", severeConfirmed: true }] }, null, seed);
    expect(r.lMicro).toBe(1_200_000n); // 20%
  });
});

describe("NECA branch", () => {
  it("bands the total: all-1 -> 1.00, all-2 -> 1.25, all-3 -> 1.50", () => {
    expect(computeLossMultiplier({ mode: "neca", neca: { scores: nall(1) } }, null, seed).lMicro).toBe(1_000_000n);
    expect(computeLossMultiplier({ mode: "neca", neca: { scores: nall(2) } }, null, seed).lMicro).toBe(1_250_000n);
    expect(computeLossMultiplier({ mode: "neca", neca: { scores: nall(3) } }, null, seed).lMicro).toBe(1_500_000n);
  });
});

describe("per-line compose", () => {
  it("stacks L_line on the MCAA baseline (baseline x line)", () => {
    // baseline 25% -> 1.25 ; height 10-20 -> +25% -> 1.25 ; combined 1.5625
    const r = computeLossMultiplier(
      { mode: "mcaa", mcaa: [{ key: "logistics", severity: "average" }] }, { heightBand: "10-20" }, seed,
    );
    expect(r.lMicro).toBe(1_562_500n);
  });
  it("height + floor uplifts are additive within L_line", () => {
    // height 10-20 (+25) + floor 3-6 (+1) = +26% -> 1.26
    const r = computeLossMultiplier({ mode: "mcaa", mcaa: [] }, { heightBand: "10-20", floorBand: "3-6" }, seed);
    expect(r.lMicro).toBe(1_260_000n);
  });
});
