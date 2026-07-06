"use client";
import { useState, useTransition } from "react";
import { addDayLog } from "./actions";

export interface CatalogModel {
  trade: string;
  modelId: string;
  modelLabel: string;
  laborComponents: Array<{ id: string; labelAr: string }>;
}

const UNITS = ["m2", "m3", "lm", "ton", "nr", "kg", "pc"];

export function DayLogForm({ catalog }: { catalog: CatalogModel[] }) {
  const [modelId, setModelId] = useState("");
  const [componentId, setComponentId] = useState("");
  const [date, setDate] = useState("");
  const [crewSkilled, setCrewSkilled] = useState("1");
  const [crewHelpers, setCrewHelpers] = useState("0");
  const [hours, setHours] = useState("8");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("m2");
  const [rework, setRework] = useState("0");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const model = catalog.find((m) => m.modelId === modelId);

  function save() {
    if (!model || !date || !qty) return;
    setSaved(false);
    start(async () => {
      await addDayLog({
        trade: model.trade, costModelId: model.modelId, componentId: componentId || undefined,
        date, crewSkilled, crewHelpers, hoursWorked: hours, quantityInstalled: qty, unitCanonical: unit, reworkQuantity: rework,
      });
      setSaved(true);
      setQty(""); setRework("0");
    });
  }

  const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none";
  const label = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <details className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50">
        سجل الإنتاج اليومي (يغذّي التعلّم)
      </summary>
      <div className="border-t border-gray-100 p-5 grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={label}>نموذج التسعير</label>
          <select className={field} value={modelId}
            onChange={(e) => { setModelId(e.target.value); setComponentId(""); setSaved(false); }}>
            <option value="">— اختر —</option>
            {catalog.map((m) => <option key={m.modelId} value={m.modelId}>{m.trade} — {m.modelLabel}</option>)}
          </select>
        </div>
        {model && model.laborComponents.length > 0 && (
          <div className="col-span-2">
            <label className={label}>بند العمالة</label>
            <select className={field} value={componentId} onChange={(e) => { setComponentId(e.target.value); setSaved(false); }}>
              <option value="">— اختر —</option>
              {model.laborComponents.map((c) => <option key={c.id} value={c.id}>{c.labelAr}</option>)}
            </select>
          </div>
        )}
        <div><label className={label}>التاريخ</label><input type="date" className={field} value={date} onChange={(e) => { setDate(e.target.value); setSaved(false); }} /></div>
        <div><label className={label}>الوحدة</label>
          <select className={field} value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div><label className={label}>عمّال مهرة</label><input className={field} inputMode="numeric" value={crewSkilled} onChange={(e) => setCrewSkilled(e.target.value)} /></div>
        <div><label className={label}>مساعدون</label><input className={field} inputMode="numeric" value={crewHelpers} onChange={(e) => setCrewHelpers(e.target.value)} /></div>
        <div><label className={label}>ساعات العمل</label><input className={field} inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} /></div>
        <div><label className={label}>الكمية المُنجَزة</label><input className={field} inputMode="decimal" value={qty} onChange={(e) => { setQty(e.target.value); setSaved(false); }} /></div>
        <div><label className={label}>إعادة العمل</label><input className={field} inputMode="decimal" value={rework} onChange={(e) => setRework(e.target.value)} /></div>
        <div className="col-span-2 flex items-center gap-3 pt-1">
          <button onClick={save} disabled={pending || !model || !date || !qty}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {pending ? "يحفظ…" : "حفظ اليوم"}
          </button>
          {saved && <span className="text-sm text-green-700">تم الحفظ</span>}
        </div>
      </div>
    </details>
  );
}
