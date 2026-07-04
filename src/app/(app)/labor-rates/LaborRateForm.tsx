"use client";
import { useState } from "react";
import type { LaborRate, LaborRateInput } from "./types";

type Row = { key: number; label: string; output: string; unit: string };

let seq = 0;
const nextKey = () => (seq += 1);

function rowsFrom(rate?: LaborRate): Row[] {
  if (!rate || rate.labor_rate_productivity.length === 0) return [];
  return rate.labor_rate_productivity.map((p) => ({
    key: nextKey(),
    label: p.label,
    output: String(p.output_per_day),
    unit: p.unit,
  }));
}

// Shared add/edit form. Big fonts + large touch targets — old-school engineers
// filling this on a phone. Arabic RTL to match the rest of the app.
export function LaborRateForm({
  rate,
  onSubmit,
  onCancel,
}: {
  rate?: LaborRate;
  onSubmit: (input: LaborRateInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(rate?.name ?? "");
  const [dayRate, setDayRate] = useState(rate ? String(rate.day_rate) : "");
  const [currency, setCurrency] = useState(rate?.currency ?? "JOD");
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(rate));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim() !== "" && dayRate.trim() !== "";

  function addRow() {
    setRows((r) => [...r, { key: nextKey(), label: "", output: "", unit: "m²" }]);
  }
  function removeRow(key: number) {
    setRows((r) => r.filter((x) => x.key !== key));
  }
  function setRow(key: number, field: "label" | "output" | "unit", value: string) {
    setRows((r) => r.map((x) => (x.key === key ? { ...x, [field]: value } : x)));
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setPending(true);
    try {
      await onSubmit({
        name: name.trim(),
        day_rate: parseFloat(dayRate),
        currency: currency.trim() || "JOD",
        productivity: rows.map((r) => ({
          label: r.label.trim(),
          output_per_day: parseFloat(r.output),
          unit: r.unit.trim() || "m²",
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر الحفظ");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <label className="block text-base font-semibold text-gray-800">
        اسم المهنة
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
          autoFocus
          placeholder="حداد مسلّح"
          className="mt-2 min-h-14 w-full rounded-xl border-2 border-gray-300 px-4 text-lg text-gray-900 focus:border-blue-600 focus:outline-none disabled:opacity-50"
        />
      </label>

      <div className="flex gap-3">
        <label className="block flex-1 text-base font-semibold text-gray-800">
          أجرة اليوم
          <input
            value={dayRate}
            onChange={(e) => setDayRate(e.target.value)}
            disabled={pending}
            inputMode="decimal"
            placeholder="0.000"
            dir="ltr"
            className="mt-2 min-h-14 w-full rounded-xl border-2 border-gray-300 px-4 text-lg text-gray-900 tabular-nums text-right focus:border-blue-600 focus:outline-none disabled:opacity-50"
          />
        </label>
        <label className="block w-28 text-base font-semibold text-gray-800">
          العملة
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={pending}
            dir="ltr"
            className="mt-2 min-h-14 w-full rounded-xl border-2 border-gray-300 px-3 text-lg text-gray-900 text-center focus:border-blue-600 focus:outline-none disabled:opacity-50"
          />
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold text-gray-800">الإنتاجية (اختياري)</span>
          <button
            type="button"
            onClick={addRow}
            disabled={pending}
            className="min-h-11 rounded-lg bg-gray-200 px-4 text-base font-medium text-gray-700 active:bg-gray-300 disabled:opacity-50"
          >
            + بند
          </button>
        </div>

        {rows.map((row) => (
          <div key={row.key} className="flex flex-col gap-2 rounded-xl border-2 border-gray-200 p-3">
            <div className="flex gap-2">
              <input
                value={row.label}
                onChange={(e) => setRow(row.key, "label", e.target.value)}
                disabled={pending}
                placeholder="الوصف — مثال: بلوك"
                className="min-h-12 flex-1 rounded-lg border-2 border-gray-300 px-3 text-base text-gray-900 focus:border-blue-600 focus:outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => removeRow(row.key)}
                disabled={pending}
                aria-label="حذف البند"
                className="min-h-12 min-w-12 rounded-lg bg-red-100 text-lg font-bold text-red-700 active:bg-red-200 disabled:opacity-50"
              >
                ✕
              </button>
            </div>
            <div className="flex gap-2">
              <input
                value={row.output}
                onChange={(e) => setRow(row.key, "output", e.target.value)}
                disabled={pending}
                inputMode="decimal"
                placeholder="الإنتاج/اليوم"
                dir="ltr"
                className="min-h-12 flex-1 rounded-lg border-2 border-gray-300 px-3 text-base text-gray-900 tabular-nums text-right focus:border-blue-600 focus:outline-none disabled:opacity-50"
              />
              <input
                value={row.unit}
                onChange={(e) => setRow(row.key, "unit", e.target.value)}
                disabled={pending}
                placeholder="الوحدة"
                dir="ltr"
                className="min-h-12 w-24 rounded-lg border-2 border-gray-300 px-3 text-base text-gray-900 text-center focus:border-blue-600 focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-base font-medium text-red-700">{error}</p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="min-h-14 flex-1 rounded-xl bg-gray-200 text-lg font-semibold text-gray-700 active:bg-gray-300 disabled:opacity-50"
        >
          إلغاء
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending || !canSubmit}
          className="min-h-14 flex-1 rounded-xl bg-gray-900 text-lg font-semibold text-white active:bg-gray-800 disabled:opacity-50"
        >
          {pending ? "..." : "حفظ"}
        </button>
      </div>
    </div>
  );
}
