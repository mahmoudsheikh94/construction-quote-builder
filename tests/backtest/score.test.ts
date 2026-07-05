import { describe, it, expect } from "vitest";
import { scoreQuote } from "@/lib/backtest/score";
import type { PricedRow } from "@/lib/export/priced-boq";
import type { GoldenLineRow } from "@/lib/backtest/types";

const golden: GoldenLineRow[] = [
  { sortOrder: 0, itemCode: "1", descriptionOriginal: "Supply C30 concrete", unitCanonical: "m3", truthRateFils: 10000, truthAmountFils: 100000, trade: "concrete" },
  { sortOrder: 1, itemCode: "2", descriptionOriginal: "Blockwork", unitCanonical: "m2", truthRateFils: 10000, truthAmountFils: 40000, trade: "blockwork" },
];

describe("scoreQuote", () => {
  it("computes signed bps error and within-bands", () => {
    const rows: PricedRow[] = [
      { itemCode: "1", sectionRef: "A", description: "Supply C30 concrete", unit: "m3", quantity: "10", rateJD: "10.500", amountJD: "105.000", flags: [] }, // +5% -> +500 bps
      { itemCode: "2", sectionRef: "A", description: "Blockwork", unit: "m2", quantity: "4", rateJD: "13.000", amountJD: "52.000", flags: [] }, // +30% -> +3000 bps
    ];
    const s = scoreQuote({ pricedRows: rows, goldenLines: golden });
    expect(s.lines.find((l) => l.position === 0)?.eBps).toBe(500);
    expect(s.lines.find((l) => l.position === 1)?.eBps).toBe(3000);
    expect(s.within5).toBe(50); // 1 of 2 within +/-5%
    expect(s.within10).toBe(50);
    expect(s.medianAbsBps).toBe(1750); // (500 + 3000) / 2
    expect(s.grandTotalDevBps).toBe(1214); // (157000-140000)/140000 = 12.14% -> 1214 bps
    expect(s.byTrade.concrete.count).toBe(1);
    expect(s.byTrade.blockwork.meanSignedBps).toBe(3000);
  });

  it("excludes NO_MATCH / NEEDS_MANUAL lines from rate accuracy (coverage only)", () => {
    const rows: PricedRow[] = [
      { itemCode: "1", sectionRef: "A", description: "Supply C30 concrete", unit: "m3", quantity: "10", rateJD: null, amountJD: null, flags: ["NO_MATCH"] },
    ];
    const s = scoreQuote({ pricedRows: rows, goldenLines: golden });
    expect(s.medianAbsBps).toBeNull(); // no priced lines -> null, never 0
    expect(s.coverage).toBe(0);
  });
});
