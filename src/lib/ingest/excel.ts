import * as XLSX from "xlsx";
import type { ExtractionResult, RawLine } from "./types";

// Header synonyms across the two BOQ dialects (Arabic-native + English CSI).
const COL = {
  code: ["الرقم", "رقم", "item", "item no", "no", "code"],
  desc: ["وصف البند", "نوع العمل", "الوصف", "description", "particulars"],
  unit: ["الوحدة", "وحدة القياس", "unit", "uom"],
  qty: ["الكمية", "quantity", "qty"],
};

function findCol(header: string[], names: string[]): number {
  const norm = header.map((h) => String(h ?? "").trim().toLowerCase());
  for (const n of names) { const i = norm.indexOf(n.toLowerCase()); if (i !== -1) return i; }
  return -1;
}

export function ingestExcel(path: string, opts?: { sheet?: string }): ExtractionResult {
  const wb = XLSX.readFile(path);
  const sheetName = opts?.sheet ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, raw: false });
  const warnings: string[] = [];
  if (rows.length < 2) return { lines: [], warnings: ["الورقة فارغة أو لا تحتوي بيانات"] };

  const header = rows[0].map((c) => String(c ?? ""));
  const cCode = findCol(header, COL.code), cDesc = findCol(header, COL.desc);
  const cUnit = findCol(header, COL.unit), cQty = findCol(header, COL.qty);
  if (cDesc === -1) warnings.push("تعذّر تحديد عمود الوصف — سيُستخدم العمود الثاني");

  const lines: RawLine[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const desc = String(row[cDesc === -1 ? 1 : cDesc] ?? "").trim();
    if (!desc) continue; // skip blank/section-separator rows
    lines.push({
      sortOrder: lines.length,
      itemCode: cCode !== -1 ? String(row[cCode] ?? "").trim() || undefined : undefined,
      sectionRef: sectionOf(cCode !== -1 ? String(row[cCode] ?? "") : ""),
      descriptionOriginal: desc,
      unitRaw: cUnit !== -1 ? String(row[cUnit] ?? "").trim() || undefined : undefined,
      quantityRaw: cQty !== -1 ? String(row[cQty] ?? "").trim() || undefined : undefined,
    });
  }
  return { lines, warnings };
}

// Section = the part of the item code before the first "/" (e.g. "2/1" -> "2"); else "0".
function sectionOf(code: string): string {
  const m = code.trim().match(/^([^/.\s]+)/);
  return m ? m[1] : "0";
}
