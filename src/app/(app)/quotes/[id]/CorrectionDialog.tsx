"use client";
import { useState } from "react";
import type { LineItemRow } from "@/lib/db/quotes";
import { filsToJDString } from "@/lib/domain/money";

export function CorrectionDialog({
  line,
  pending,
  onClose,
  onApply,
}: {
  line: LineItemRow;
  pending: boolean;
  onClose: () => void;
  onApply: (newRateJD: string, scope: "quote" | "trade") => void;
}) {
  const [rate, setRate] = useState(line.rate_fils != null ? filsToJDString(line.rate_fils) : "");

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 w-full max-w-md space-y-4">
        <div>
          <h3 className="font-medium text-gray-900">تصحيح السعر</h3>
          <p className="text-sm text-gray-600 mt-1">{line.description_original}</p>
        </div>

        <label className="block text-sm text-gray-700">
          سعر الوحدة (د.أ)
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-2 mt-1 text-gray-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="0.000"
            inputMode="decimal"
            disabled={pending}
            autoFocus
          />
        </label>

        <div className="flex flex-wrap gap-2 justify-end pt-1">
          <button
            onClick={onClose}
            disabled={pending}
            className="border border-gray-300 rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            onClick={() => onApply(rate, "quote")}
            disabled={pending}
            className="border border-gray-300 rounded-lg px-3 py-2 text-gray-900 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            هذا العرض فقط
          </button>
          <button
            onClick={() => onApply(rate, "trade")}
            disabled={pending}
            className="rounded-lg px-3 py-2 bg-gray-900 text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            تحديث المهنة
          </button>
        </div>
      </div>
    </div>
  );
}
