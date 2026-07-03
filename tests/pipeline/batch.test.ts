import { describe, it, expect } from "vitest";
import { chunk, mapLimit, batchTagLines, BATCH_TAGS_SCHEMA } from "@/lib/pipeline/batch";
import { makeAdapter } from "@/lib/ai/adapter";
import type { RawLine } from "@/lib/ingest/types";

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

const lines: RawLine[] = [
  { sortOrder: 0, sectionRef: "5", descriptionOriginal: "بلاط سيراميك 60x60", unitRaw: "م2" },
  { sortOrder: 1, sectionRef: "5", descriptionOriginal: "دهان جدران", unitRaw: "م2" },
];

describe("batchTagLines", () => {
  it("tags all lines in one call, aligned by index", async () => {
    const adapter = makeAdapter(async () => JSON.stringify({
      tags: [
        { index: 0, material: "ceramic", dimensions: "60x60", category: "floor" },
        { index: 1, material: "paint", category: "wall" },
      ],
    }));
    const trade = `tiling_${Date.now()}`;
    const out = await batchTagLines(adapter, trade, lines);
    expect(out).toHaveLength(2);
    expect(out[0].material).toBe("ceramic");
    expect(out[1].category).toBe("wall");
  });

  it("fills gaps with empty tags when the AI omits a line", async () => {
    const adapter = makeAdapter(async () => JSON.stringify({ tags: [{ index: 0, material: "ceramic" }] }));
    const out = await batchTagLines(adapter, `t_${Date.now()}`, lines);
    expect(out).toHaveLength(2);
    expect(out[0].material).toBe("ceramic");
    expect(out[1]).toEqual({}); // line 1 omitted → empty, not a crash
  });

  it("returns [] with no AI call for empty input", async () => {
    const adapter = makeAdapter(async () => { throw new Error("must not call AI"); });
    expect(await batchTagLines(adapter, "t", [])).toEqual([]);
  });
});
