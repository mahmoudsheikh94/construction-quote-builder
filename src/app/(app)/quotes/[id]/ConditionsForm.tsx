"use client";
import { useState, useTransition } from "react";
import { saveConditions } from "./actions";

type Severity = "minor" | "average" | "severe";
export interface McaaFactor { key: string; labelAr: string; minor: number; average: number; severe: number }
export interface NecaRow { key: string; labelAr: string }

const MAX_MCAA = 5;

export function ConditionsForm({
  quoteId, mcaaFactors, necaRows, initialMode,
}: {
  quoteId: string;
  mcaaFactors: McaaFactor[];
  necaRows: NecaRow[];
  initialMode: "mcaa" | "neca";
}) {
  const [mode, setMode] = useState<"mcaa" | "neca">(initialMode);
  const [selected, setSelected] = useState<Record<string, Severity>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [scores, setScores] = useState<Record<string, 1 | 2 | 3>>({});
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const chosen = Object.keys(selected);
  const mcaaSum = chosen.reduce((s, k) => {
    const f = mcaaFactors.find((x) => x.key === k)!;
    const sev = selected[k];
    return s + (sev === "minor" ? f.minor : sev === "average" ? f.average : f.severe);
  }, 0);
  const L = (1 + mcaaSum / 100).toFixed(2);

  const necaTotal = necaRows.reduce((s, r) => s + (scores[r.key] ?? 1), 0);
  const necaL = necaTotal <= 40 ? "1.00" : necaTotal <= 70 ? "1.25" : "1.50";

  function toggle(key: string) {
    setSaved(false);
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) { delete next[key]; return next; }
      if (chosen.length >= MAX_MCAA) return prev; // hard cap
      next[key] = "average";
      return next;
    });
  }

  function save() {
    setSaved(false);
    start(async () => {
      if (mode === "mcaa") {
        await saveConditions(quoteId, {
          mode: "mcaa",
          mcaa: chosen.map((k) => ({ key: k, severity: selected[k], severeConfirmed: confirmed[k] })),
        });
      } else {
        await saveConditions(quoteId, { mode: "neca", neca: { scores } });
      }
      setSaved(true);
    });
  }

  const tab = (m: "mcaa" | "neca", label: string) => (
    <button onClick={() => { setMode(m); setSaved(false); }}
      className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${mode === m ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
      {label}
    </button>
  );

  return (
    <details className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50">
        ظروف الموقع (معامل الإنتاجية)
      </summary>
      <div className="border-t border-gray-100 p-5 space-y-4">
        <div className="flex items-center gap-2">
          {tab("mcaa", "عوامل MCAA")}
          {tab("neca", "استبيان NECA")}
          <span className="ms-auto text-sm text-gray-500">
            المعامل: <span className="font-semibold text-gray-900">{mode === "mcaa" ? L : necaL}×</span>
          </span>
        </div>

        {mode === "mcaa" ? (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-500">اختر حتى {MAX_MCAA} عوامل ({chosen.length}/{MAX_MCAA}). المجموع {mcaaSum}%.</p>
            {mcaaFactors.map((f) => {
              const sev = selected[f.key];
              return (
                <div key={f.key} className="flex items-center gap-3 text-sm">
                  <label className="flex items-center gap-2 flex-1">
                    <input type="checkbox" checked={!!sev} onChange={() => toggle(f.key)} />
                    <span className="text-gray-900">{f.labelAr}</span>
                  </label>
                  {sev && (
                    <select className="rounded border border-gray-300 px-2 py-1 text-xs" value={sev}
                      onChange={(e) => { setSaved(false); setSelected((p) => ({ ...p, [f.key]: e.target.value as Severity })); }}>
                      <option value="minor">بسيط {f.minor}%</option>
                      <option value="average">متوسط {f.average}%</option>
                      <option value="severe">شديد {f.severe}%</option>
                    </select>
                  )}
                  {sev === "severe" && (
                    <label className="flex items-center gap-1 text-xs text-amber-700">
                      <input type="checkbox" checked={!!confirmed[f.key]}
                        onChange={(e) => { setSaved(false); setConfirmed((p) => ({ ...p, [f.key]: e.target.checked })); }} />
                      تأكيد
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            <p className="text-xs text-gray-500">قيّم كل بند: عادي / صعب / صعب جداً. المجموع {necaTotal} → {necaL}×.</p>
            {necaRows.map((r) => (
              <div key={r.key} className="flex items-center gap-3 text-sm">
                <span className="flex-1 text-gray-900">{r.labelAr}</span>
                <select className="rounded border border-gray-300 px-2 py-1 text-xs" value={scores[r.key] ?? 1}
                  onChange={(e) => { setSaved(false); setScores((p) => ({ ...p, [r.key]: Number(e.target.value) as 1 | 2 | 3 })); }}>
                  <option value={1}>عادي</option>
                  <option value={2}>صعب</option>
                  <option value={3}>صعب جداً</option>
                </select>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button onClick={save} disabled={pending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {pending ? "يعيد التسعير…" : "حفظ وإعادة التسعير"}
          </button>
          {saved && <span className="text-sm text-green-700">تم الحفظ</span>}
        </div>
      </div>
    </details>
  );
}
