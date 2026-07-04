"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTrade } from "./actions";

const UNITS = ["m2", "m3", "lm", "ton", "nr", "ls", "pc", "kg", "day", "hr"] as const;

// Slugify an Arabic/English label into a safe latin key. Falls back to a timestamp-free stub.
function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function AddTradeDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [nameAr, setNameAr] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [modelLabelAr, setModelLabelAr] = useState("");
  const [unit, setUnit] = useState<(typeof UNITS)[number]>("m2");
  const [priceJD, setPriceJD] = useState("");
  const [markupPct, setMarkupPct] = useState("10");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugTouched ? slug : slugify(nameAr);
  const canSubmit = nameAr.trim() && effectiveSlug && modelLabelAr.trim() && priceJD.trim();

  async function handleCreate() {
    if (!canSubmit) return;
    setError(null);
    setPending(true);
    try {
      await createTrade({
        slug: effectiveSlug,
        nameAr: nameAr.trim(),
        modelLabelAr: modelLabelAr.trim(),
        unit,
        priceJD: priceJD.trim(),
        markupPct: markupPct.trim() || "0",
      });
      router.push(`/trades/${effectiveSlug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر إنشاء المهنة");
      setPending(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 w-full max-w-md space-y-4">
        <h3 className="font-medium text-gray-900">مهنة جديدة</h3>

        <label className="block text-sm text-gray-700">
          اسم المهنة (عربي)
          <input
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            disabled={pending}
            autoFocus
            placeholder="أعمال الدهان"
            className="w-full border border-gray-300 rounded-lg p-2 mt-1 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          />
        </label>

        <label className="block text-sm text-gray-700">
          المُعرّف (slug)
          <input
            value={effectiveSlug}
            onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
            disabled={pending}
            placeholder="painting"
            dir="ltr"
            className="w-full border border-gray-300 rounded-lg p-2 mt-1 text-gray-900 font-mono text-sm text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          />
        </label>

        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500 mb-2">أول بند تسعير</p>
          <label className="block text-sm text-gray-700">
            الوصف
            <input
              value={modelLabelAr}
              onChange={(e) => setModelLabelAr(e.target.value)}
              disabled={pending}
              placeholder="دهان جدران"
              className="w-full border border-gray-300 rounded-lg p-2 mt-1 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
            />
          </label>

          <div className="flex gap-3 mt-3">
            <label className="block text-sm text-gray-700 flex-1">
              الوحدة
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as (typeof UNITS)[number])}
                disabled={pending}
                className="w-full border border-gray-300 rounded-lg p-2 mt-1 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              >
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <label className="block text-sm text-gray-700 flex-1">
              السعر (د.أ)
              <input
                value={priceJD}
                onChange={(e) => setPriceJD(e.target.value)}
                disabled={pending}
                inputMode="decimal"
                placeholder="5.000"
                className="w-full border border-gray-300 rounded-lg p-2 mt-1 text-gray-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              />
            </label>
            <label className="block text-sm text-gray-700 w-20">
              هامش %
              <input
                value={markupPct}
                onChange={(e) => setMarkupPct(e.target.value)}
                disabled={pending}
                inputMode="decimal"
                placeholder="10"
                className="w-full border border-gray-300 rounded-lg p-2 mt-1 text-gray-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              />
            </label>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onClose}
            disabled={pending}
            className="border border-gray-300 rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            onClick={handleCreate}
            disabled={pending || !canSubmit}
            className="rounded-lg px-3 py-2 bg-gray-900 text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {pending ? "..." : "إنشاء المهنة"}
          </button>
        </div>
      </div>
    </div>
  );
}
