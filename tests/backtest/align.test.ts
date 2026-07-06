import { describe, it, expect } from "vitest";
import { normDesc, normCode, jaccardGe, alignLines } from "@/lib/backtest/align";
import type { GoldenLineRow } from "@/lib/backtest/types";

describe("normalization", () => {
  it("normCode strips non-alphanumerics and uppercases", () => {
    expect(normCode("2/1")).toBe("21");
    expect(normCode(" a-1 ")).toBe("A1");
    expect(normCode("")).toBe("");
    expect(normCode(null)).toBe("");
  });
  it("normDesc collapses whitespace and drops punctuation", () => {
    expect(normDesc("  Supply,  C30   concrete! ")).toBe("supply c30 concrete");
  });
  it("jaccardGe compares token-set overlap as an integer ratio", () => {
    expect(jaccardGe("supply c30 concrete", "supply c30 concrete m3", 60)).toBe(true);
    expect(jaccardGe("supply concrete", "install ceramic tile", 60)).toBe(false);
  });
});

const golden: GoldenLineRow[] = [
  { sortOrder: 0, itemCode: "1", descriptionOriginal: "Supply C30 concrete", unitCanonical: "m3", truthRateFils: 9000, truthAmountFils: null, trade: "concrete" },
  { sortOrder: 1, itemCode: null, descriptionOriginal: "Blockwork 200mm hollow", unitCanonical: "m2", truthRateFils: 8500, truthAmountFils: null, trade: "blockwork" },
];

describe("alignLines", () => {
  it("pass 1 matches on exact item code", () => {
    const priced = [{ position: 0, itemCode: "1", descriptionOriginal: "different text", unitCanonical: "m3", rateFils: 9100, flags: [] }];
    const pairs = alignLines(priced, golden);
    expect(pairs.find((p) => p.position === 0)?.sortOrder).toBe(0);
  });
  it("pass 2 falls back to description similarity when code is blank", () => {
    const priced = [{ position: 0, itemCode: undefined, descriptionOriginal: "Blockwork 200mm hollow block", unitCanonical: "m2", rateFils: 8600, flags: [] }];
    const pairs = alignLines(priced, golden);
    expect(pairs.find((p) => p.position === 0)?.sortOrder).toBe(1);
  });
  it("blank code never counts as an exact match", () => {
    const priced = [{ position: 0, itemCode: "", descriptionOriginal: "totally unrelated widget", unitCanonical: "nr", rateFils: 1, flags: [] }];
    const pairs = alignLines(priced, golden);
    expect(pairs.find((p) => p.position === 0)?.sortOrder ?? null).toBeNull();
  });
  it("is one-to-one (a golden line is claimed once)", () => {
    const priced = [
      { position: 0, itemCode: "1", descriptionOriginal: "Supply C30 concrete", unitCanonical: "m3", rateFils: 9000, flags: [] },
      { position: 1, itemCode: "1", descriptionOriginal: "Supply C30 concrete again", unitCanonical: "m3", rateFils: 9000, flags: [] },
    ];
    const pairs = alignLines(priced, golden);
    const claimed = pairs.filter((p) => p.sortOrder === 0);
    expect(claimed).toHaveLength(1); // only one priced line claims golden sortOrder 0
  });
});
