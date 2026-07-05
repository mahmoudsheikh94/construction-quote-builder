import { describe, it, expect } from "vitest";
import { gateVerdict } from "@/lib/backtest/gate";
import type { ScoreSummary } from "@/lib/backtest/types";

const base: ScoreSummary = {
  within5: 40, within10: 60, within20: 80, medianAbsBps: 1000, meanSignedBps: 300,
  grandTotalDevBps: 1200, coverage: 90, byTrade: {}, lines: [],
};

describe("gateVerdict", () => {
  it("passes when candidate improves median and does not regress grand total", () => {
    const cand = { ...base, medianAbsBps: 700, grandTotalDevBps: 1100 };
    expect(gateVerdict(base, cand).pass).toBe(true);
  });
  it("fails when candidate regresses grand-total deviation", () => {
    const cand = { ...base, medianAbsBps: 700, grandTotalDevBps: 1500 };
    expect(gateVerdict(base, cand).pass).toBe(false);
  });
  it("fails when nothing improves", () => {
    expect(gateVerdict(base, { ...base }).pass).toBe(false);
  });
  it("treats a larger |grandTotalDev| as a regression even if signed value drops", () => {
    // baseline +1200; candidate -1500 -> |1500| > |1200| = regression
    const cand = { ...base, grandTotalDevBps: -1500 };
    expect(gateVerdict(base, cand).pass).toBe(false);
  });
});
