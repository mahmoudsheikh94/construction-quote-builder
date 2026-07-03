import { describe, it, expect } from "vitest";
import { pageRanges, checksumWarnings } from "@/lib/ingest/pdf";
import type { RawLine } from "@/lib/ingest/types";

describe("pageRanges", () => {
  it("splits pages into inclusive 1-based chunks", () => {
    expect(pageRanges(10, 4)).toEqual([[1, 4], [5, 8], [9, 10]]);
    expect(pageRanges(3, 4)).toEqual([[1, 3]]);
    expect(pageRanges(0, 4)).toEqual([]);
  });
});

describe("checksumWarnings", () => {
  it("flags a line whose numeric qty disagrees with its words", () => {
    const lines: RawLine[] = [
      { sortOrder: 0, sectionRef: "1", descriptionOriginal: "حفر", quantityRaw: "18000", quantityWords: "ثمانية عشر ألف" }, // agrees
      { sortOrder: 1, sectionRef: "1", descriptionOriginal: "خرسانة", quantityRaw: "93", quantityWords: "ثلاثة وتسعون" },   // agrees
      { sortOrder: 2, sectionRef: "1", descriptionOriginal: "حديد", quantityRaw: "61", quantityWords: "خمسون" },            // 61 vs 50 -> mismatch
    ];
    const warns = checksumWarnings(lines);
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain("2"); // references the offending sortOrder/line
  });
  it("skips lines with no words (checksum simply unavailable)", () => {
    expect(checksumWarnings([{ sortOrder: 0, sectionRef: "1", descriptionOriginal: "x", quantityRaw: "5" }])).toEqual([]);
  });
});
