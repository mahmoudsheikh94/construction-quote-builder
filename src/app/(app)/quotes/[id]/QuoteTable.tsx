"use client";
import { useState } from "react";
import type { LineItemRow } from "@/lib/db/quotes";
import { filsToJDString } from "@/lib/domain/money";
import { applyCorrection } from "./actions";
import { CorrectionDialog } from "./CorrectionDialog";

export function QuoteTable({ quoteId, lines }: { quoteId: string; lines: LineItemRow[] }) {
  const [editing, setEditing] = useState<LineItemRow | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grand = lines.reduce((a, l) => a + (l.amount_fils ?? 0), 0);

  async function handleApply(newRateJD: string, scope: "quote" | "trade") {
    if (!editing) return;
    setError(null);
    setPending(true);
    try {
      await applyCorrection(quoteId, {
        lineItemId: editing.id,
        newRateJD,
        quantityThousandths: editing.quantity_thousandths ?? null,
        scope,
        priceBookKey: editing.item_code ?? undefined,
        unit: editing.unit_canonical ?? editing.unit_raw ?? undefined,
        labelAr: editing.description_original,
      });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر حفظ التصحيح");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-right bg-gray-50 text-gray-600">
              <th className="p-3 font-medium">الرقم</th>
              <th className="p-3 font-medium">الوصف</th>
              <th className="p-3 font-medium">الوحدة</th>
              <th className="p-3 font-medium">الكمية</th>
              <th className="p-3 font-medium">سعر الوحدة</th>
              <th className="p-3 font-medium">المبلغ</th>
              <th className="p-3 font-medium">الحالة</th>
              <th className="p-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const flags = Array.isArray(l.flags) ? (l.flags as string[]) : [];
              const flagged = flags.length > 0;
              return (
                <tr
                  key={l.id}
                  className={`border-b border-gray-100 last:border-b-0 transition-colors ${
                    flagged ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-gray-50"
                  }`}
                >
                  <td className="p-3 text-gray-600">{l.item_code ?? "—"}</td>
                  <td className="p-3 max-w-sm text-gray-900">{l.description_original}</td>
                  <td className="p-3 text-gray-600">{l.unit_raw ?? "—"}</td>
                  <td className="p-3 text-gray-600 tabular-nums">
                    {l.quantity_thousandths != null ? (l.quantity_thousandths / 1000).toString() : "—"}
                  </td>
                  <td className="p-3 text-gray-900 tabular-nums">
                    {l.rate_fils != null ? filsToJDString(l.rate_fils) : "—"}
                  </td>
                  <td className="p-3 text-gray-900 font-medium tabular-nums">
                    {l.amount_fils != null ? filsToJDString(l.amount_fils) : "—"}
                  </td>
                  <td className="p-3 text-xs">
                    {flagged ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 font-medium">
                        {flags.join(", ")}
                      </span>
                    ) : (
                      <span className="text-gray-400">مُسعّر</span>
                    )}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => setEditing(l)}
                      className="text-blue-700 hover:text-blue-800 font-medium"
                    >
                      تعديل
                    </button>
                  </td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-500">
                  لا توجد بنود في هذا العرض.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="font-medium bg-gray-50">
              <td colSpan={5} className="p-3 text-right text-gray-700">المجموع الكلي</td>
              <td className="p-3 text-gray-900 tabular-nums">{filsToJDString(grand)} د.أ</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm p-3">
          {error}
        </div>
      )}

      {editing && (
        <CorrectionDialog
          line={editing}
          pending={pending}
          onClose={() => {
            setEditing(null);
            setError(null);
          }}
          onApply={handleApply}
        />
      )}
    </div>
  );
}
