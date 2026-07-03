import { describe, it, expect, beforeAll } from "vitest";
import * as XLSX from "xlsx";
import { writeFileSync, mkdirSync } from "node:fs";
import { ingestExcel } from "@/lib/ingest/excel";

const fixture = "tests/fixtures/mini-boq.xlsx";

beforeAll(() => {
  mkdirSync("tests/fixtures", { recursive: true });
  const rows = [
    ["الرقم", "وصف البند", "الوحدة", "الكمية"],
    ["1/1", "حفريات للأساسات", "م3", "18000"],
    ["2/1", "خرسانة عادية درجة 18", "م3", "93"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BOQ");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  writeFileSync(fixture, buf);
});

describe("ingestExcel", () => {
  it("maps rows to RawLine[] with header detection", () => {
    const { lines } = ingestExcel(fixture);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ itemCode: "1/1", descriptionOriginal: "حفريات للأساسات", unitRaw: "م3", quantityRaw: "18000", sortOrder: 0 });
    expect(lines[1].descriptionOriginal).toContain("خرسانة");
  });

  it("derives sectionRef from the item code prefix", () => {
    // sectionRef drives rollup grouping downstream, so verify it maps correctly.
    const { lines } = ingestExcel(fixture);
    expect(lines[0].sectionRef).toBe("1"); // "1/1" -> "1"
    expect(lines[1].sectionRef).toBe("2"); // "2/1" -> "2"
  });

  it("finds the header when it is NOT on row 0 (title rows above it)", () => {
    // Real BOQs (e.g. AlSafi) put a project title + section label above the header.
    const f = "tests/fixtures/header-not-row0.xlsx";
    const rows = [
      ["LMJ3"],
      ["Civil works"],
      [null, "Descriptions", "Unit", "Qty", "Unit Price", "Total price"],
      ["1.10", "Supply porcelain floor tile", "m2", "4950", "9", "44550"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Civil");
    writeFileSync(f, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    const { lines } = ingestExcel(f);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ descriptionOriginal: "Supply porcelain floor tile", unitRaw: "m2", quantityRaw: "4950" });
    // The price columns (Unit Price / Total) must NOT leak into unit/qty.
    expect(lines[0].unitRaw).toBe("m2");
    expect(lines[0].quantityRaw).toBe("4950");
  });

  it("matches a qualified quantity header like 'الكمية المتوقعة' (substring, trailing space)", () => {
    // Real BOQs (e.g. Labs) label the quantity column "expected quantity".
    const f = "tests/fixtures/qualified-qty-header.xlsx";
    const rows = [
      ["وصف البند", "الوحدة ", "السعر الافرادي", "الكمية المتوقعة ", "السعر الإجمالي"],
      ["توريد وتركيب بلاط", "م²", null, "410", "0"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ورقة1");
    writeFileSync(f, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    const { lines } = ingestExcel(f);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantityRaw).toBe("410"); // matched despite "المتوقعة" + trailing space
    expect(lines[0].unitRaw).toBe("م²");
    // "السعر الافرادي" (unit price) must not be mistaken for the quantity.
  });

  it("reads ALL data sheets and skips summary/blank sheets when no sheet is specified", () => {
    // Real BOQs split bills across tabs; a summary tab must not be treated as data,
    // and data on a non-first sheet must not be missed.
    const f = "tests/fixtures/multi-sheet.xlsx";
    const wb = XLSX.utils.book_new();
    // Sheet 0: a summary/totals sheet (no priceable items).
    const s0 = XLSX.utils.aoa_to_sheet([["الخلاصة"], ["المجموع", null, "0"]]);
    XLSX.utils.book_append_sheet(wb, s0, "Summary");
    // Sheet 1: Bill 1 data.
    const s1 = XLSX.utils.aoa_to_sheet([["وصف البند", "الوحدة", "الكمية"], ["بند أول", "م²", "100"]]);
    XLSX.utils.book_append_sheet(wb, s1, "Bill1");
    // Sheet 2: Bill 2 data.
    const s2 = XLSX.utils.aoa_to_sheet([["وصف البند", "الوحدة", "الكمية"], ["بند ثاني", "م³", "50"]]);
    XLSX.utils.book_append_sheet(wb, s2, "Bill2");
    writeFileSync(f, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    const { lines, warnings } = ingestExcel(f);
    // Both data sheets' items, NOT the summary sheet.
    expect(lines.map((l) => l.descriptionOriginal)).toEqual(["بند أول", "بند ثاني"]);
    // Continuous sortOrder across sheets.
    expect(lines.map((l) => l.sortOrder)).toEqual([0, 1]);
    // Section refs are sheet-prefixed so cross-sheet sections don't collide.
    expect(lines[0].sectionRef).toContain("Bill1::");
    expect(lines[1].sectionRef).toContain("Bill2::");
    // The summary sheet is reported as skipped.
    expect(warnings.some((w) => w.includes("Summary"))).toBe(true);
  });

  it("reads only the named sheet when opts.sheet is given (no sheet prefix)", () => {
    const f = "tests/fixtures/named-sheet.xlsx";
    const wb = XLSX.utils.book_new();
    const s1 = XLSX.utils.aoa_to_sheet([["وصف البند", "الوحدة", "الكمية"], ["بند", "م²", "10"]]);
    XLSX.utils.book_append_sheet(wb, s1, "Data");
    const s2 = XLSX.utils.aoa_to_sheet([["وصف البند", "الوحدة", "الكمية"], ["آخر", "م³", "20"]]);
    XLSX.utils.book_append_sheet(wb, s2, "Other");
    writeFileSync(f, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    const { lines } = ingestExcel(f, { sheet: "Data" });
    expect(lines).toHaveLength(1);
    expect(lines[0].descriptionOriginal).toBe("بند");
    expect(lines[0].sectionRef).toBe("0"); // single named sheet → no prefix
  });

  it("skips carried-forward / summary rows", () => {
    const f = "tests/fixtures/summary-rows.xlsx";
    const rows = [
      ["وصف البند", "الوحدة", "الكمية"],
      ["بند حقيقي", "م²", "100"],
      ["ينقل الى صفحة المجاميع", null, "0"],
      ["المجموع", null, "0"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S");
    writeFileSync(f, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    const { lines } = ingestExcel(f);
    expect(lines).toHaveLength(1); // only the real item, not the carried-forward/total rows
    expect(lines[0].descriptionOriginal).toBe("بند حقيقي");
  });
});
