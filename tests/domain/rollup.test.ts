import { describe, it, expect } from "vitest";
import { buildRollup, verifyRollup } from "@/lib/domain/rollup";

const lines = [
  { sectionRef: "1", amountFils: 100_000 },
  { sectionRef: "1", amountFils: 50_000 },
  { sectionRef: "2", amountFils: 200_000 },
  { sectionRef: "2", amountFils: null },     // unpriced item
];

describe("buildRollup", () => {
  it("totals per section (ordered by first appearance) and grand total", () => {
    const r = buildRollup(lines);
    expect(r.sections).toEqual([
      { sectionRef: "1", totalFils: 150_000, itemCount: 2, unpricedCount: 0 },
      { sectionRef: "2", totalFils: 200_000, itemCount: 2, unpricedCount: 1 },
    ]);
    expect(r.grandTotalFils).toBe(350_000);
  });
});

describe("verifyRollup", () => {
  it("passes when reported totals reconcile to the fils", () => {
    const r = buildRollup(lines);
    expect(verifyRollup(r, { sectionTotals: { "1": 150_000, "2": 200_000 }, grandTotalFils: 350_000 })).toEqual([]);
  });
  it("flags any discrepancy", () => {
    const r = buildRollup(lines);
    const flags = verifyRollup(r, { sectionTotals: { "1": 150_001 }, grandTotalFils: 350_000 });
    expect(flags).toHaveLength(1);
    expect(flags[0].code).toBe("ROLLUP_MISMATCH");
    expect(flags[0].detail).toMatchObject({ sectionRef: "1", computed: 150_000, reported: 150_001 });
  });
});
