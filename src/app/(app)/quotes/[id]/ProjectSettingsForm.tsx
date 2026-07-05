"use client";
import { useState, useTransition } from "react";
import { saveProjectSettings } from "./actions";
import type { QuoteSettings } from "@/lib/db/quotes";

const CLASS_LABELS: Record<string, string> = {
  "": "— غير محدد —",
  "5": "Class 5 — مبدئي (−50/+100%)",
  "4": "Class 4 — تخطيطي (−30/+50%)",
  "3": "Class 3 — ~30% تصميم (−20/+30%)",
  "2": "Class 2 — ~70% تصميم (−15/+20%)",
  "1": "Class 1 — تصميم كامل (−10/+15%)",
};

export function ProjectSettingsForm({ quoteId, settings }: { quoteId: string; settings: QuoteSettings }) {
  const o = (settings.overrides ?? {}) as { profitPct?: string; locationFactor?: { labor?: string; material?: string }; targetDate?: string };
  const [gfa, setGfa] = useState(settings.grossFloorAreaM2?.toString() ?? "");
  const [storeys, setStoreys] = useState(settings.storeys?.toString() ?? "");
  const [height, setHeight] = useState(settings.avgStoreyHeightM?.toString() ?? "");
  const [estimateClass, setClass] = useState(settings.estimateClass?.toString() ?? "");
  const [region, setRegion] = useState(settings.region ?? "");
  const [profit, setProfit] = useState(o.profitPct ?? "");
  const [locLabor, setLocLabor] = useState(o.locationFactor?.labor ?? "");
  const [locMaterial, setLocMaterial] = useState(o.locationFactor?.material ?? "");
  const [targetDate, setTargetDate] = useState(o.targetDate ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function save() {
    setSaved(false);
    start(async () => {
      await saveProjectSettings(quoteId, {
        grossFloorAreaM2: gfa, storeys, avgStoreyHeightM: height, estimateClass,
        region, profitPct: profit, locationFactorLabor: locLabor, locationFactorMaterial: locMaterial, targetDate,
      });
      setSaved(true);
    });
  }

  const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none";
  const label = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <details className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50">
        إعدادات المشروع (تُعيد التسعير)
      </summary>
      <div className="border-t border-gray-100 p-5 grid grid-cols-2 gap-4">
        <div>
          <label className={label}>المساحة الطابقية (م²)</label>
          <input className={field} inputMode="decimal" value={gfa} onChange={(e) => setGfa(e.target.value)} />
        </div>
        <div>
          <label className={label}>عدد الطوابق</label>
          <input className={field} inputMode="numeric" value={storeys} onChange={(e) => setStoreys(e.target.value)} />
        </div>
        <div>
          <label className={label}>ارتفاع الطابق (م)</label>
          <input className={field} inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
        </div>
        <div>
          <label className={label}>المنطقة</label>
          <input className={field} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="amman" />
        </div>
        <div>
          <label className={label}>معامل المنطقة — عمالة</label>
          <input className={field} inputMode="decimal" value={locLabor} onChange={(e) => setLocLabor(e.target.value)} placeholder="1.0" />
        </div>
        <div>
          <label className={label}>معامل المنطقة — مواد</label>
          <input className={field} inputMode="decimal" value={locMaterial} onChange={(e) => setLocMaterial(e.target.value)} placeholder="1.0" />
        </div>
        <div>
          <label className={label}>الربح (%)</label>
          <input className={field} inputMode="decimal" value={profit} onChange={(e) => setProfit(e.target.value)} />
        </div>
        <div>
          <label className={label}>تاريخ العطاء</label>
          <input className={field} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className={label}>درجة دقة التقدير</label>
          <select className={field} value={estimateClass} onChange={(e) => setClass(e.target.value)}>
            {Object.entries(CLASS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="col-span-2 flex items-center gap-3 pt-1">
          <button onClick={save} disabled={pending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {pending ? "يعيد التسعير…" : "حفظ وإعادة التسعير"}
          </button>
          {saved && <span className="text-sm text-green-700">تم الحفظ وإعادة التسعير</span>}
        </div>
      </div>
    </details>
  );
}
