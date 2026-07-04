"use client";
import { useState } from "react";
import type { LaborRate, LaborRateInput } from "./types";
import { deleteLaborRate, updateLaborRate } from "./actions";
import { LaborRateForm } from "./LaborRateForm";

export function LaborRateCard({ rate }: { rate: LaborRate }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const hasProductivity = rate.labor_rate_productivity.length > 0;

  async function onUpdate(input: LaborRateInput) {
    await updateLaborRate(rate.id, input);
    setEditing(false);
  }

  async function onDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteLaborRate(rate.id);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "تعذّر الحذف");
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-2xl border-2 border-blue-600 bg-white p-5 shadow-sm">
        <LaborRateForm rate={rate} onSubmit={onUpdate} onCancel={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => hasProductivity && setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-3 p-5 text-right"
      >
        <div className="flex flex-col gap-1">
          <span className="text-xl font-bold text-gray-900">{rate.name}</span>
          <span className="text-2xl font-extrabold text-blue-700 tabular-nums" dir="ltr">
            {rate.day_rate.toLocaleString()} {rate.currency}
            <span className="ms-1 text-base font-medium text-gray-500">/ يوم</span>
          </span>
        </div>
        {hasProductivity && (
          <span
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-gray-100 text-2xl text-gray-600"
            aria-hidden
          >
            {expanded ? "−" : "+"}
          </span>
        )}
      </button>

      {expanded && hasProductivity && (
        <div className="flex flex-col gap-2 border-t border-gray-100 px-5 py-4">
          {rate.labor_rate_productivity.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 text-lg"
            >
              <span className="font-medium text-gray-700">{p.label}</span>
              <span className="font-semibold text-gray-900 tabular-nums" dir="ltr">
                {p.output_per_day.toLocaleString()} {p.unit}/يوم
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 border-t border-gray-100 p-5 pt-4">
        {confirmingDelete ? (
          <div className="flex w-full flex-col gap-3">
            <p className="text-lg font-semibold text-red-700">حذف {rate.name}؟ لا يمكن التراجع.</p>
            {deleteError && <p className="text-base font-medium text-red-600">{deleteError}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="min-h-14 flex-1 rounded-xl bg-gray-200 text-lg font-semibold text-gray-700 active:bg-gray-300 disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="min-h-14 flex-1 rounded-xl bg-red-600 text-lg font-semibold text-white active:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "..." : "تأكيد الحذف"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="min-h-14 flex-1 rounded-xl bg-gray-200 text-lg font-semibold text-gray-700 active:bg-gray-300"
            >
              تعديل
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="min-h-14 flex-1 rounded-xl bg-red-50 text-lg font-semibold text-red-700 active:bg-red-100"
            >
              حذف
            </button>
          </>
        )}
      </div>
    </div>
  );
}
