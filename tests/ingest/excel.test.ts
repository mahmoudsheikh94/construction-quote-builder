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
