import * as XLSX from "xlsx";
import type {
  ExtractionResult,
  PricedExtractionResult,
  PricedRawLine,
  RawLine,
} from "./types";
import { parseJDNumberToFils } from "./price-parse";

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

// For the priced-column reader (readPrices), split the combined PRICE_HEADER into
// unit-rate vs total-amount, so the golden-set builder reads human truth prices.
// Match rate before amount ("unit price" is more specific than "price"/"total").
const RATE_HEADER = ["سعر الوحدة", "سعر", "unit price", "unit rate", "rate"];
const AMOUNT_HEADER = ["المبلغ", "الاجمالي", "الإجمالي", "total price", "total", "amount"];

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

// Extract line items from ONE sheet. sortOffset keeps sortOrder continuous when
// concatenating multiple sheets; sheetTag prefixes sectionRef so sections from
// different sheets don't collide in the rollup.
function ingestSheet(
  ws: XLSX.WorkSheet, sortOffset: number, sheetTag: string, readPrices = false,
): { lines: PricedRawLine[]; warnings: string[] } {
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, raw: false });
  if (rows.length < 2) return { lines: [], warnings: [] };
  // Parallel raw-number view for price cells (raw:false stringifies numbers).
  const rawRows = readPrices
    ? XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, raw: true })
    : null;

  const headerRow = findHeaderRow(rows);
  const headerNorm = (rows[headerRow] ?? []).map(norm);

  const priceCols: number[] = [];
  headerNorm.forEach((c, i) => { if (PRICE_HEADER.some((p) => c.includes(p.toLowerCase()))) priceCols.push(i); });

  const cCode = matchCol(headerNorm, COL.code);
  const cUnit = matchCol(headerNorm, COL.unit, priceCols);
  const cQty = matchCol(headerNorm, COL.qty, priceCols);
  const cDesc = matchCol(headerNorm, COL.desc, [cCode, cUnit, cQty, ...priceCols].filter((i) => i >= 0));

  // Rate before amount (specificity), independent of the qty/desc exclusion.
  const cRate = readPrices ? matchCol(headerNorm, RATE_HEADER) : -1;
  const cAmount = readPrices ? matchCol(headerNorm, AMOUNT_HEADER, cRate >= 0 ? [cRate] : []) : -1;

  const warnings: string[] = [];
  const descCol = cDesc !== -1 ? cDesc : (cCode === 0 ? 1 : 0);
  const lines: PricedRawLine[] = [];

  const priceFils = (rawRow: unknown[] | undefined, col: number): number | null => {
    if (!rawRow || col < 0) return null;
    const v = rawRow[col];
    return typeof v === "number" && Number.isFinite(v) ? parseJDNumberToFils(v) : null;
  };

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const desc = String(row[descCol] ?? "").trim();
    if (!desc) continue;
    if (/^(ينقل|منقول|المجموع|الخلاصة|collection|summary|total carried|carried to)/i.test(desc)) continue;
    const code = cCode !== -1 ? String(row[cCode] ?? "").trim() || undefined : undefined;
    const unitRaw = cUnit !== -1 ? String(row[cUnit] ?? "").trim() || undefined : undefined;
    const quantityRaw = cQty !== -1 ? String(row[cQty] ?? "").trim() || undefined : undefined;

    let truthRateFils: number | null | undefined;
    let truthAmountFils: number | null | undefined;
    if (readPrices) {
      truthRateFils = priceFils(rawRows?.[r], cRate);
      truthAmountFils = priceFils(rawRows?.[r], cAmount);
      // Section-header skip: a row with a description but no unit, qty, rate AND
      // amount is a grouping header — omit it even if it carries an item code.
      if (!unitRaw && !quantityRaw && truthRateFils == null && truthAmountFils == null) continue;
    }

    const line: PricedRawLine = {
      sortOrder: sortOffset + lines.length,
      itemCode: code,
      sectionRef: `${sheetTag}${sectionOf(code ?? "")}`,
      descriptionOriginal: desc,
      unitRaw,
      quantityRaw,
    };
    if (readPrices) {
      line.truthRateFils = truthRateFils ?? null;
      line.truthAmountFils = truthAmountFils ?? null;
    }
    lines.push(line);
  }

  if (lines.length > 0) {
    if (cDesc === -1) warnings.push(`تعذّر تحديد عمود الوصف في الورقة "${sheetTag || "؟"}"`);
    if (cQty === -1) warnings.push(`تعذّر تحديد عمود الكمية في الورقة "${sheetTag || "؟"}"`);
    if (readPrices && cRate === -1 && cAmount === -1) {
      warnings.push(`تعذّر تحديد عمود السعر في الورقة "${sheetTag || "؟"}"`);
    }
  }
  return { lines, warnings };
}

// Ingest a BOQ workbook. With opts.sheet, reads ONLY that sheet. Otherwise reads
// EVERY sheet that yields line items (real BOQs split bills/divisions across
// tabs, and the data sheet is not always sheet 0), concatenating them with
// continuous sortOrder. Sheets that yield nothing (summary/blank) are noted.
export function ingestExcel(path: string, opts?: { sheet?: string; readPrices?: boolean }): ExtractionResult | PricedExtractionResult {
  const wb = XLSX.readFile(path);
  const targetSheets = opts?.sheet ? [opts.sheet] : wb.SheetNames;
  const readPrices = opts?.readPrices ?? false;

  const allLines: PricedRawLine[] = [];
  const warnings: string[] = [];
  const multi = targetSheets.length > 1;
  let dataSheets = 0;
  const skipped: string[] = [];

  for (const sn of targetSheets) {
    const ws = wb.Sheets[sn];
    if (!ws) { warnings.push(`الورقة "${sn}" غير موجودة`); continue; }
    // Prefix sectionRef with the sheet name only when spanning multiple sheets,
    // so a single-sheet workbook keeps its clean section numbers.
    const sheetTag = multi ? `${sn}::` : "";
    const { lines, warnings: w } = ingestSheet(ws, allLines.length, sheetTag, readPrices);
    if (lines.length > 0) { dataSheets++; allLines.push(...lines); warnings.push(...w); }
    else skipped.push(sn);
  }

  if (allLines.length === 0) {
    return { lines: [], warnings: [...warnings, "لم يتم العثور على بنود في أي ورقة"] };
  }
  if (multi) {
    warnings.push(`تمت قراءة ${dataSheets} ورقة بيانات من أصل ${targetSheets.length}` +
      (skipped.length ? ` (تم تخطي: ${skipped.join("، ")})` : ""));
  }
  return { lines: allLines, warnings };
}

// Section = the part of the item code before the first "/" or "." (e.g. "2/1" -> "2",
// "1.10" -> "1"); else "0".
function sectionOf(code: string): string {
  const m = code.trim().match(/^([^/.\s]+)/);
  return m ? m[1] : "0";
}
