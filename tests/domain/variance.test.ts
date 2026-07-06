import { describe, it, expect } from "vitest";
import { ewmaUpdate, normKey } from "@/lib/domain/variance";

describe("ewmaUpdate", () => {
  it("nudges prev toward actual by alpha=0.30 (fixed-point)", () => {
    // 0.7*10 + 0.3*12 = 10.6 -> 10_600_000 micro
    expect(ewmaUpdate(10_000_000n, 12_000_000n)).toBe(10_600_000n);
  });
  it("returns prev when actual equals prev", () => {
    expect(ewmaUpdate(10_000_000n, 10_000_000n)).toBe(10_000_000n);
  });
});

describe("normKey", () => {
  it("joins parts with colons", () => {
    expect(normKey("productivity", ["tiling", "m1", "c2"])).toBe("tiling:m1:c2");
  });
});
