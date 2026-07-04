"use client";
import { useState } from "react";
import { AddTradeDialog } from "./AddTradeDialog";

export function AddTradeButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg px-4 py-2 bg-gray-900 text-white hover:bg-gray-800 transition-colors text-sm font-medium"
      >
        + مهنة جديدة
      </button>
      {open && <AddTradeDialog onClose={() => setOpen(false)} />}
    </>
  );
}
