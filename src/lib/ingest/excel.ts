import * as XLSX from "xlsx";
import type { ExtractionResult, RawLine } from "./types";

// Header synonyms across the two BOQ dialects (Arabic-native + English CSI).
// Matching is substring-based and normalized, so trailing spaces and qualifiers
// like "الكمية المتوقعة" (expected quantity) or "Unit Price" still resolve.
const COL = {
  code: ["الرقم", "رقم البند", "رقم", "item no", "item", "s.no", "sr", "no.", "code"],
  desc: ["وصف البند", "نوع العمل", "الوصف", "description", "descriptions", "particulars", "item description"],
  unit: ["وحدة القياس", "الوحدة", "unit", "uom"],
  qty: ["الكمية المتوقعة", "الكمية", "quantity", "qty", "q'ty"],
};

// Columns we must NOT confuse with quantity/desc — price/total columns.
const PRICE_HEADER = ["السعر", "المبلغ", "الاجمالي", "الإجمالي", "unit price", "total price", "total", "amount", "rate"];

function norm(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

// A header cell matches a synonym if the (normalized) cell CONTAINS the synonym.
// Longer synonyms are listed first so the most specific wins.
function matchCol(headerNorm: string[], names: string[], exclude: number[] = []): number {
  for (const n of names) {
    const target = n.toLowerCase();
    for (let i = 0; i < headerNorm.length; i++) {
      if (exclude.includes(i)) continue;
      if ((headerNorm[i] ?? "").includes(target)) return i;
    }
  }
  return -1;
}

// Real BOQs put title rows above the header (e.g. "LMJ3", "Civil works", company
// name). Scan the first rows and pick the one that looks most like a header:
// the row where the most of our known column-synonyms appear.
function findHeaderRow(rows: string[][], scan = 20): number {
  let best = -1, bestScore = 0;
  const limit = Math.min(scan, rows.length);
  for (let r = 0; r < limit; r++) {
    const cells = (rows[r] ?? []).map(norm);
    let score = 0;
    for (const group of [COL.desc, COL.unit, COL.qty]) {
      if (group.some((n) => cells.some((c) => c.includes(n.toLowerCase())))) score++;
    }
    // A real header has at least description + one of unit/qty.
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return bestScore >= 2 ? best : 0; // fall back to row 0 if nothing clearly matches
}

export function ingestExcel(path: string, opts?: { sheet?: string }): ExtractionResult {
  const wb = XLSX.readFile(path);
  const sheetName = opts?.sheet ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, raw: false });
  const warnings: string[] = [];
  if (rows.length < 2) return { lines: [], warnings: ["الورقة فارغة أو لا تحتوي بيانات"] };

  const headerRow = findHeaderRow(rows);
  const headerNorm = (rows[headerRow] ?? []).map(norm);

  // Resolve price columns first so qty/desc matching can avoid them.
  const priceCols: number[] = [];
  headerNorm.forEach((c, i) => { if (PRICE_HEADER.some((p) => c.includes(p.toLowerCase()))) priceCols.push(i); });

  const cCode = matchCol(headerNorm, COL.code);
  const cUnit = matchCol(headerNorm, COL.unit, priceCols);
  const cQty = matchCol(headerNorm, COL.qty, priceCols);
  // Description must not be the code/unit/qty/price column.
  const cDesc = matchCol(headerNorm, COL.desc, [cCode, cUnit, cQty, ...priceCols].filter((i) => i >= 0));

  if (cDesc === -1) warnings.push("تعذّر تحديد عمود الوصف — سيُستخدم العمود التالي للرقم");
  if (cQty === -1) warnings.push("تعذّر تحديد عمود الكمية");

  // Fallback description column: the first non-code column at/after the header, else 1.
  const descCol = cDesc !== -1 ? cDesc : (cCode === 0 ? 1 : 0);

  const lines: RawLine[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const desc = String(row[descCol] ?? "").trim();
    if (!desc) continue; // skip blank / section-separator rows
    // Skip obvious carried-forward / summary rows.
    if (/^(ينقل|منقول|المجموع|الخلاصة|collection|summary|total carried|carried to)/i.test(desc)) continue;
    const code = cCode !== -1 ? String(row[cCode] ?? "").trim() || undefined : undefined;
    lines.push({
      sortOrder: lines.length,
      itemCode: code,
      sectionRef: sectionOf(code ?? ""),
      descriptionOriginal: desc,
      unitRaw: cUnit !== -1 ? String(row[cUnit] ?? "").trim() || undefined : undefined,
      quantityRaw: cQty !== -1 ? String(row[cQty] ?? "").trim() || undefined : undefined,
    });
  }
  return { lines, warnings };
}

// Section = the part of the item code before the first "/" or "." (e.g. "2/1" -> "2",
// "1.10" -> "1"); else "0".
function sectionOf(code: string): string {
  const m = code.trim().match(/^([^/.\s]+)/);
  return m ? m[1] : "0";
}
