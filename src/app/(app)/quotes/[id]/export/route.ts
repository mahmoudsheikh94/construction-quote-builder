import { getQuote } from "@/lib/db/quotes";
import { buildRollup } from "@/lib/domain/rollup";
import ExcelJS from "exceljs";
import { filsToJDString } from "@/lib/domain/money";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const q = await getQuote(id, db);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("عرض السعر", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: "الرقم", key: "code", width: 10 }, { header: "الوصف", key: "desc", width: 50 },
    { header: "الوحدة", key: "unit", width: 8 }, { header: "الكمية", key: "qty", width: 12 },
    { header: "سعر الوحدة (د.أ)", key: "rate", width: 16 }, { header: "المبلغ (د.أ)", key: "amount", width: 16 },
    { header: "ملاحظات", key: "flags", width: 24 },
  ];
  for (const l of q.lines) ws.addRow({
    code: l.item_code, desc: l.description_original, unit: l.unit_raw,
    qty: l.quantity_thousandths != null ? l.quantity_thousandths / 1000 : "",
    rate: l.rate_fils != null ? filsToJDString(l.rate_fils) : "",
    amount: l.amount_fils != null ? filsToJDString(l.amount_fils) : "",
    flags: (l.flags as string[]).join(", "),
  });
  const rollup = buildRollup(q.lines.map((l) => ({ sectionRef: l.section_ref, amountFils: l.amount_fils })));
  ws.addRow({}); ws.addRow({ desc: "المجموع الكلي", amount: filsToJDString(rollup.grandTotalFils) });
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="quote-${id}.xlsx"`,
    },
  });
}
