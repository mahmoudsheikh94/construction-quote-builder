"use client";
import { useState } from "react";
import type { SkillContent, CostModel } from "@/lib/domain/skill-schema";
import { saveTrade } from "./actions";

const UNITS = ["m2", "m3", "lm", "ton", "nr", "ls", "day", "night", "pc", "hr", "kg", "pct"] as const;

function emptyModel(index: number, slug: string): CostModel {
  return {
    id: `${slug}.model_${index}`,
    labelAr: "",
    unit: "m2",
    keywords: [],
    components: [{ id: "c1", kind: "material", labelAr: "", priceBookKey: "", qtyPerUnit: "1" }],
    wastePct: "0",
    markupPct: "0",
  };
}

export function TradeEditor({ slug, nameAr, content }: { slug: string; nameAr: string; content: SkillContent }) {
  const [models, setModels] = useState<CostModel[]>(content.costModels);
  const [changelog, setChangelog] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function update(i: number, patch: Partial<CostModel>) {
    setModels((m) => m.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  function updateComponent(i: number, priceBookKey: string) {
    setModels((m) =>
      m.map((x, j) => (j === i ? { ...x, components: [{ ...x.components[0], priceBookKey }] } : x)),
    );
  }

  function addModel() {
    setModels((m) => [...m, emptyModel(m.length + 1, slug)]);
  }

  function removeModel(i: number) {
    setModels((m) => m.filter((_, j) => j !== i));
  }

  async function handleSave() {
    setSaving(true);
    setErr(null);
    setSavedAt(null);
    try {
      await saveTrade({ slug, nameAr, content: { trade: slug, costModels: models }, changelog: changelog || "تعديل" });
      setChangelog("");
      setSavedAt(Date.now());
    } catch {
      setErr("تعذّر الحفظ — تحقّق من صحة القيم (الوحدات، النسب العشرية، الحقول المطلوبة).");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">نماذج التسعير</h2>
        <button
          onClick={addModel}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          + نموذج تسعير
        </button>
      </div>

      <div className="space-y-3">
        {models.map((m, i) => (
          <div key={i} className="border border-gray-200 rounded-xl bg-white p-4 space-y-3">
            <div className="flex gap-2">
              <input
                value={m.labelAr}
                onChange={(e) => update(i, { labelAr: e.target.value })}
                placeholder="اسم النموذج (مثال: بلاط أرضيات)"
                className="flex-1 border border-gray-300 rounded-lg p-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <select
                value={m.unit}
                onChange={(e) => update(i, { unit: e.target.value as CostModel["unit"] })}
                className="border border-gray-300 rounded-lg p-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <button
                onClick={() => removeModel(i)}
                title="حذف النموذج"
                className="text-red-600 hover:text-red-700 px-2 rounded-lg hover:bg-red-50 transition-colors"
              >
                حذف
              </button>
            </div>

            <input
              value={m.keywords.join("، ")}
              onChange={(e) =>
                update(i, { keywords: e.target.value.split(/[،,]/).map((s) => s.trim()).filter(Boolean) })
              }
              placeholder="كلمات مفتاحية (مفصولة بفاصلة)"
              className="w-full border border-gray-300 rounded-lg p-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />

            <div className="flex gap-2">
              <input
                value={m.components[0]?.priceBookKey ?? ""}
                onChange={(e) => updateComponent(i, e.target.value)}
                placeholder="مفتاح دفتر الأسعار"
                className="flex-1 border border-gray-300 rounded-lg p-2 text-gray-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <label className="flex items-center gap-1 text-xs text-gray-500">
                هدر %
                <input
                  value={m.wastePct}
                  onChange={(e) => update(i, { wastePct: e.target.value })}
                  inputMode="decimal"
                  placeholder="0"
                  className="w-20 border border-gray-300 rounded-lg p-2 text-gray-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-500">
                ربح %
                <input
                  value={m.markupPct}
                  onChange={(e) => update(i, { markupPct: e.target.value })}
                  inputMode="decimal"
                  placeholder="0"
                  className="w-20 border border-gray-300 rounded-lg p-2 text-gray-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </label>
            </div>
          </div>
        ))}
        {models.length === 0 && (
          <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center text-gray-500">
            لا توجد نماذج تسعير بعد — أضف نموذجاً للبدء.
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 pt-4 flex items-center gap-2">
        <input
          value={changelog}
          onChange={(e) => setChangelog(e.target.value)}
          placeholder="سبب التعديل (سيظهر في سجل النسخ)"
          className="flex-1 border border-gray-300 rounded-lg p-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-gray-900 text-white rounded-lg px-4 py-2 font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {saving ? "جارٍ الحفظ..." : "حفظ نسخة جديدة"}
        </button>
      </div>
      {err && <p className="text-red-600 text-sm">{err}</p>}
      {savedAt && !err && <p className="text-green-700 text-sm">تم الحفظ وتفعيل النسخة الجديدة.</p>}
    </section>
  );
}
