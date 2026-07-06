import { describe, it, expect, beforeAll } from "vitest";
import * as XLSX from "xlsx";
import { writeFileSync, mkdirSync } from "node:fs";
import { ingestExcel } from "@/lib/ingest/excel";
import type { PricedExtractionResult } from "@/lib/ingest/types";

const fixture = "tests/fixtures/priced-mini.xlsx";

beforeAll(() => {
  mkdirSync("tests/fixtures", { recursive: true });
  const rows = [
    ["Descriptions", "Unit", "Qty", "Unit Price", "Total price"],
    ["Section A concrete", "", "", "", ""], // header row: desc only -> skipped
    ["Supply C30 concrete", "m3", 10, 9, 90], // integer rate
    ["Blockwork 200mm", "m2", 4, 8.5, 34], // decimal rate
    ["Plaster two coats", "m2", 4, 1.1000000000000001, ""], // float artifact, blank amount
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  writeFileSync(fixture, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
});

describe("ingestExcel readPrices", () => {
  it("reads truth rate/amount fils and skips the section header", () => {
    const r = ingestExcel(fixture, { readPrices: true }) as PricedExtractionResult;
    const lines = r.lines;
    // section-header row (desc only, no unit/qty/rate/amount) is skipped
    expect(lines.map((l) => l.descriptionOriginal)).toEqual([
      "Supply C30 concrete",
      "Blockwork 200mm",
      "Plaster two coats",
    ]);
    expect(lines[0].truthRateFils).toBe(9000);
    expect(lines[0].truthAmountFils).toBe(90000);
    expect(lines[1].truthRateFils).toBe(8500);
    expect(lines[2].truthRateFils).toBe(1100); // float artifact absorbed
    expect(lines[2].truthAmountFils).toBeNull(); // blank amount -> null, never synthesized
  });

  it("without readPrices, behaves as before (no truth fields)", () => {
    const r = ingestExcel(fixture);
    expect(
      (r.lines[0] as { truthRateFils?: number }).truthRateFils,
    ).toBeUndefined();
  });
});
