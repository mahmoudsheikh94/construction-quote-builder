import ExcelJS from "exceljs";
import type { RawLine } from "@/lib/ingest/types";
import type { PricedLine } from "@/lib/domain/price-quote";
import type { QuoteRollup } from "@/lib/domain/rollup";
import type { Flag } from "@/lib/domain/types";
import { filsToJDString } from "@/lib/domain/money";

export interface PricedRow {
  itemCode?: string; sectionRef: string; description: string; unit?: string; quantity?: string;
  rateJD: string | null; amountJD: string | null; flags: string[];
}

export function toPricedRows(rawLines: RawLine[], lines: PricedLine[]): PricedRow[] {
  const byId = new Map(lines.map((l) => [l.id, l]));
  return rawLines.map((raw) => {
    const id = raw.itemCode ?? `row-${raw.sortOrder}`;
    const p = byId.get(id);
    return {
      itemCode: raw.itemCode, sectionRef: raw.sectionRef, description: raw.descriptionOriginal,
      unit: raw.unitRaw, quantity: raw.quantityRaw,
      rateJD: p?.rateFils != null ? filsToJDString(p.rateFils) : null,
      amountJD: p?.amountFils != null ? filsToJDString(p.amountFils) : null,
      flags: (p?.flags ?? []).map((f) => f.code),
    };
  });
}

export function toPricedJson(rows: PricedRow[], rollup: QuoteRollup, projectFlags: Flag[]) {
  return {
    rows,
    sections: rollup.sections.map((s) => ({ ...s, totalJD: filsToJDString(s.totalFils) })),
    grandTotalJD: filsToJDString(rollup.grandTotalFils),
    projectFlags: projectFlags.map((f) => ({ code: f.code, messageAr: f.messageAr })),
  };
}

export async function writePricedExcel(path: string, rows: PricedRow[], rollup: QuoteRollup): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("عرض السعر", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: "الرقم", key: "itemCode", width: 10 },
    { header: "الوصف", key: "description", width: 50 },
    { header: "الوحدة", key: "unit", width: 8 },
    { header: "الكمية", key: "quantity", width: 12 },
    { header: "سعر الوحدة (د.أ)", key: "rateJD", width: 16 },
    { header: "المبلغ (د.أ)", key: "amountJD", width: 16 },
    { header: "ملاحظات", key: "flags", width: 24 },
  ];
  for (const r of rows) ws.addRow({ ...r, flags: r.flags.join(", ") });
  ws.addRow({});
  ws.addRow({ description: "المجموع الكلي", amountJD: filsToJDString(rollup.grandTotalFils) });
  await wb.xlsx.writeFile(path);
}
