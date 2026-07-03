import { describe, it, expect } from "vitest";
import { chunk, mapLimit, batchTagLines, BATCH_TAGS_SCHEMA, batchMatchLines } from "@/lib/pipeline/batch";
import { makeAdapter } from "@/lib/ai/adapter";
import type { RawLine } from "@/lib/ingest/types";
import type { SkillContent } from "@/lib/domain/skill-schema";

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

const skill: SkillContent = {
  trade: "tiling",
  costModels: [
    { id: "tiling.ceramic_floor", labelAr: "بلاط سيراميك", unit: "m2", keywords: ["سيراميك","بلاط"],
      components: [{ id: "t", kind: "material", labelAr: "بلاط", priceBookKey: "k", qtyPerUnit: "1" }], wastePct: "5", markupPct: "15" },
    { id: "paint.wall", labelAr: "دهان جدران", unit: "m2", keywords: ["دهان"],
      components: [{ id: "p", kind: "material", labelAr: "دهان", priceBookKey: "k2", qtyPerUnit: "1" }], wastePct: "0", markupPct: "10" },
  ],
};
const items = [
  { rawText: "بلاط سيراميك 60x60", tags: { material: "ceramic", category: "floor" } },
  { rawText: "دهان جدران", tags: { material: "paint", category: "wall" } },
  { rawText: "شيء غريب", tags: { material: "mystery" } },
];

describe("batchMatchLines", () => {
  it("matches each item to a cost model in one call, aligned by index", async () => {
    const trade = `tiling_${Date.now()}`;
    const adapter = makeAdapter(async () => JSON.stringify({
      matches: [
        { index: 0, costModelId: "tiling.ceramic_floor", confidence: 0.9 },
        { index: 1, costModelId: "paint.wall", confidence: 0.8 },
        { index: 2, costModelId: null, confidence: 0 },
      ],
    }));
    const out = await batchMatchLines(adapter, trade, { ...skill, trade }, items);
    expect(out[0]?.costModelId).toBe("tiling.ceramic_floor");
    expect(out[0]?.method).toBe("semantic");
    expect(out[1]?.costModelId).toBe("paint.wall");
    expect(out[2]).toBeNull(); // no fit → null
  });

  it("nulls a hallucinated cost-model id not in the skill", async () => {
    const trade = `t_${Date.now()}`;
    const adapter = makeAdapter(async () => JSON.stringify({
      matches: [{ index: 0, costModelId: "does.not.exist", confidence: 0.9 }],
    }));
    const out = await batchMatchLines(adapter, trade, { ...skill, trade }, [items[0]]);
    expect(out[0]).toBeNull();
  });

  it("returns [] with no AI call for empty input", async () => {
    const adapter = makeAdapter(async () => { throw new Error("must not call AI"); });
    expect(await batchMatchLines(adapter, "t", skill, [])).toEqual([]);
  });
});
