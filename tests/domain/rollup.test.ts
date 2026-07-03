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

  it("orders sections by first appearance, not numeric/lexical sort", () => {
    // Real BOQ section refs are not always ascending numerics (e.g. "PS" for
    // provisional sums, "12" appearing before "2"). This guards against an impl
    // that relies on Object numeric-key reordering or a sort.
    const r = buildRollup([
      { sectionRef: "12", amountFils: 10_000 },
      { sectionRef: "2", amountFils: 20_000 },
      { sectionRef: "PS", amountFils: 30_000 },
      { sectionRef: "2", amountFils: 5_000 },
    ]);
    expect(r.sections.map((s) => s.sectionRef)).toEqual(["12", "2", "PS"]);
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
  it("flags a grand-total mismatch even when section totals reconcile", () => {
    const r = buildRollup(lines);
    const flags = verifyRollup(r, { sectionTotals: { "1": 150_000, "2": 200_000 }, grandTotalFils: 350_001 });
    expect(flags).toHaveLength(1);
    expect(flags[0].code).toBe("ROLLUP_MISMATCH");
    expect(flags[0].detail).toMatchObject({ computed: 350_000, reported: 350_001 });
  });
});
