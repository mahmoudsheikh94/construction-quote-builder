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
});
