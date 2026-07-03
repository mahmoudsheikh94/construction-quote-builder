import { describe, it, expect } from "vitest";
import { chunk, mapLimit } from "@/lib/pipeline/batch";

describe("chunk", () => {
  it("splits into size-capped groups preserving order", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe("mapLimit", () => {
  it("preserves order and respects the concurrency limit", async () => {
    let active = 0, maxActive = 0;
    const fn = async (n: number) => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    };
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, fn);
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]); // order preserved
    expect(maxActive).toBeLessThanOrEqual(3);       // cap respected
  });
  it("handles empty input", async () => {
    expect(await mapLimit([], 4, async (x) => x)).toEqual([]);
  });
  it("caps workers at item count when limit exceeds it", async () => {
    let active = 0, maxActive = 0;
    const fn = async (n: number) => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n;
    };
    const out = await mapLimit([1, 2, 3], 10, fn); // limit > items
    expect(out).toEqual([1, 2, 3]);
    expect(maxActive).toBeLessThanOrEqual(3); // never more concurrent than items
  });
});
