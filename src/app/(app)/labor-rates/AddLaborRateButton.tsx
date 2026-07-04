"use client";
import { useState } from "react";
import { createLaborRate } from "./actions";
import { LaborRateForm } from "./LaborRateForm";
import type { LaborRateInput } from "./types";

export function AddLaborRateButton() {
  const [open, setOpen] = useState(false);

  async function onCreate(input: LaborRateInput) {
    await createLaborRate(input);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-14 rounded-xl bg-gray-900 px-5 text-base font-bold text-white active:bg-gray-800"
      >
        + مهنة جديدة
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl">
            <h3 className="mb-4 text-xl font-bold text-gray-900">مهنة جديدة</h3>
            <LaborRateForm onSubmit={onCreate} onCancel={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
