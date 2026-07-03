"use client";
import { useState } from "react";
import { filsToJDString } from "@/lib/domain/money";
import { upsertPriceEntry } from "./actions";

interface Row {
  key: string;
  unit: string;
  priceFils: number;
}

export function PriceBookTable({ rows }: { rows: Row[] }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const [adding, setAdding] = useState({ key: "", unit: "m2", priceJD: "" });
  const [addPending, setAddPending] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function handleSaveRow(row: Row) {
    const priceJD = draft[row.key] ?? filsToJDString(row.priceFils);
    setRowError((prev) => ({ ...prev, [row.key]: "" }));
    setSavingKey(row.key);
    try {
      await upsertPriceEntry({ key: row.key, labelAr: row.key, unit: row.unit, priceJD });
    } catch (e) {
      setRowError((prev) => ({ ...prev, [row.key]: e instanceof Error ? e.message : "تعذّر حفظ السعر" }));
    } finally {
      setSavingKey(null);
    }
  }

  async function handleAdd() {
    if (!adding.key.trim()) return;
    setAddError(null);
    setAddPending(true);
    try {
      await upsertPriceEntry({ key: adding.key.trim(), labelAr: adding.key.trim(), unit: adding.unit, priceJD: adding.priceJD });
      setAdding({ key: "", unit: "m2", priceJD: "" });
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "تعذّر إضافة البند");
    } finally {
      setAddPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-right bg-gray-50 text-gray-600">
              <th className="p-3 font-medium">المفتاح</th>
              <th className="p-3 font-medium">الوحدة</th>
              <th className="p-3 font-medium">السعر (د.أ)</th>
              <th className="p-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isSaving = savingKey === r.key;
              const err = rowError[r.key];
              return (
                <tr key={r.key} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors align-top">
                  <td className="p-3 font-mono text-xs text-gray-700">{r.key}</td>
                  <td className="p-3 text-gray-600">{r.unit}</td>
                  <td className="p-3">
                    <input
                      defaultValue={filsToJDString(r.priceFils)}
                      onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))}
                      disabled={isSaving}
                      inputMode="decimal"
                      placeholder="0.000"
                      className="w-28 border border-gray-300 rounded-lg p-1.5 text-gray-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                    />
                    {err && <p className="text-red-600 text-xs mt-1">{err}</p>}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => handleSaveRow(r)}
                      disabled={isSaving}
                      className="text-blue-700 hover:text-blue-800 font-medium disabled:opacity-50"
                    >
                      {isSaving ? "..." : "حفظ"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-gray-500">
                  لا توجد أسعار بعد — أضف بنداً جديداً بالأسفل.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 align-top">
              <td className="p-3">
                <input
                  placeholder="مفتاح جديد"
                  value={adding.key}
                  onChange={(e) => setAdding((a) => ({ ...a, key: e.target.value }))}
                  disabled={addPending}
                  className="w-full border border-gray-300 rounded-lg p-1.5 text-gray-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                />
              </td>
              <td className="p-3">
                <input
                  value={adding.unit}
                  onChange={(e) => setAdding((a) => ({ ...a, unit: e.target.value }))}
                  disabled={addPending}
                  className="w-20 border border-gray-300 rounded-lg p-1.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                />
              </td>
              <td className="p-3">
                <input
                  placeholder="0.000"
                  value={adding.priceJD}
                  onChange={(e) => setAdding((a) => ({ ...a, priceJD: e.target.value }))}
                  disabled={addPending}
                  inputMode="decimal"
                  className="w-28 border border-gray-300 rounded-lg p-1.5 text-gray-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                />
                {addError && <p className="text-red-600 text-xs mt-1">{addError}</p>}
              </td>
              <td className="p-3">
                <button
                  onClick={handleAdd}
                  disabled={addPending || !adding.key.trim()}
                  className="rounded-lg px-3 py-1.5 bg-gray-900 text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {addPending ? "..." : "إضافة"}
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
