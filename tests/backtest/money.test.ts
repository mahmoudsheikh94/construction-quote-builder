import { describe, it, expect } from "vitest";
import { roundHalfAwayFromZero } from "@/lib/domain/money";

describe("roundHalfAwayFromZero", () => {
  it("rounds positive half up, away from zero", () => {
    expect(roundHalfAwayFromZero(5n, 2n)).toBe(3n); // 2.5 -> 3
    expect(roundHalfAwayFromZero(3n, 2n)).toBe(2n); // 1.5 -> 2
  });
  it("rounds negative half away from zero (symmetric)", () => {
    expect(roundHalfAwayFromZero(-5n, 2n)).toBe(-3n); // -2.5 -> -3
    expect(roundHalfAwayFromZero(-1n, 3n)).toBe(0n); // -0.33 -> 0
  });
  it("is exact when divisible", () => {
    expect(roundHalfAwayFromZero(10000n, 100n)).toBe(100n);
    expect(roundHalfAwayFromZero(-9999n, 100n)).toBe(-100n); // -99.99 -> -100
  });
  it("throws on zero divisor", () => {
    expect(() => roundHalfAwayFromZero(1n, 0n)).toThrow();
  });
});
