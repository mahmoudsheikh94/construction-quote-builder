import { describe, it, expect } from "vitest";
import {
  parseJDToFils, filsToJDString, parseDecimalToMicro,
  roundDivHalfUp, lineAmountFils, sumFils,
} from "@/lib/domain/money";

describe("parseJDToFils", () => {
  it("parses whole and fractional JD", () => {
    expect(parseJDToFils("4")).toBe(4000);
    expect(parseJDToFils("4.52")).toBe(4520);
    expect(parseJDToFils("0.005")).toBe(5);
  });
  it("rejects more than 3 decimal places, negatives, junk", () => {
    expect(() => parseJDToFils("1.0001")).toThrow();
    expect(() => parseJDToFils("-2")).toThrow();
    expect(() => parseJDToFils("abc")).toThrow();
  });
});

describe("filsToJDString", () => {
  it("always renders 3 decimals", () => {
    expect(filsToJDString(4520)).toBe("4.520");
    expect(filsToJDString(0)).toBe("0.000");
    expect(filsToJDString(1127979500)).toBe("1127979.500");
  });
});

describe("roundDivHalfUp", () => {
  it("rounds half up", () => {
    expect(roundDivHalfUp(5n, 2n)).toBe(3n);   // 2.5 → 3
    expect(roundDivHalfUp(4n, 3n)).toBe(1n);   // 1.33 → 1
    expect(roundDivHalfUp(5n, 3n)).toBe(2n);   // 1.66 → 2
  });
});

describe("parseDecimalToMicro", () => {
  it("scales to millionths", () => {
    expect(parseDecimalToMicro("15")).toBe(15_000_000n);
    expect(parseDecimalToMicro("0.05")).toBe(50_000n);
    expect(parseDecimalToMicro("1.000001")).toBe(1_000_001n);
  });
  it("rejects >6dp and negatives", () => {
    expect(() => parseDecimalToMicro("0.0000001")).toThrow();
    expect(() => parseDecimalToMicro("-1")).toThrow();
  });
});

describe("lineAmountFils", () => {
  it("computes qty × rate with half-up rounding at the fils", () => {
    // 2700 m² × 13.388 JD = 36147.600 JD
    expect(lineAmountFils(2_700_000, 13_388)).toBe(36_147_600);
    // 1.5 units × 0.333 JD = 0.4995 → 0.500 (499.5 fils → 500)
    expect(lineAmountFils(1_500, 333)).toBe(500);
  });
});

describe("sumFils", () => {
  it("sums and rejects non-integers", () => {
    expect(sumFils([100, 200, 3])).toBe(303);
    expect(() => sumFils([1.5])).toThrow();
  });
});
