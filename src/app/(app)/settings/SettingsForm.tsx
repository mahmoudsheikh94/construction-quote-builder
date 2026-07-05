"use client";
import { useState, useTransition } from "react";
import { saveFirmSettings } from "./actions";

export function SettingsForm({
  initial,
}: {
  initial: { laborBurdenPct: string; overheadPct: string; defaultReferenceLocation: string | null };
}) {
  const [laborBurdenPct, setBurden] = useState(initial.laborBurdenPct);
  const [overheadPct, setOverhead] = useState(initial.overheadPct);
  const [defaultReferenceLocation, setLocation] = useState(initial.defaultReferenceLocation ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function save() {
    setSaved(false);
    start(async () => {
      await saveFirmSettings({ laborBurdenPct, overheadPct, defaultReferenceLocation: defaultReferenceLocation || null });
      setSaved(true);
    });
  }

  const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none";
  const label = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div className="border border-gray-200 rounded-xl bg-white p-5 space-y-4 max-w-md">
      <div>
        <label className={label} htmlFor="burden">تحميل العمالة (%)</label>
        <input id="burden" className={field} inputMode="decimal" value={laborBurdenPct}
          onChange={(e) => { setBurden(e.target.value); setSaved(false); }} />
        <p className="text-xs text-gray-500 mt-1">أعباء صاحب العمل فوق الأجر اليومي (تأمينات، ضمان، وقت غير منتِج).</p>
      </div>
      <div>
        <label className={label} htmlFor="overhead">المصاريف العامة (%)</label>
        <input id="overhead" className={field} inputMode="decimal" value={overheadPct}
          onChange={(e) => { setOverhead(e.target.value); setSaved(false); }} />
        <p className="text-xs text-gray-500 mt-1">تُطبَّق على النماذج الجديدة فقط.</p>
      </div>
      <div>
        <label className={label} htmlFor="loc">المنطقة المرجعية للأسعار</label>
        <input id="loc" className={field} value={defaultReferenceLocation}
          onChange={(e) => { setLocation(e.target.value); setSaved(false); }} placeholder="amman" />
        <p className="text-xs text-gray-500 mt-1">الأساس الذي يُنسب إليه معامل المنطقة عند غياب مرجع للبند.</p>
      </div>
      <div className="flex items-center gap-3 pt-1">
        <button onClick={save} disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {pending ? "يحفظ…" : "حفظ"}
        </button>
        {saved && <span className="text-sm text-green-700">تم الحفظ</span>}
      </div>
    </div>
  );
}
