import { listLaborRates } from "./data";
import { LaborRateCard } from "./LaborRateCard";
import { AddLaborRateButton } from "./AddLaborRateButton";
import { DayLogForm, type CatalogModel } from "./DayLogForm";
import { listSkills, getActiveSkill } from "@/lib/db/skills";
import { createClient } from "@/lib/supabase/server";

async function buildCatalog(): Promise<CatalogModel[]> {
  const db = await createClient();
  const skills = await listSkills(db);
  const catalog: CatalogModel[] = [];
  for (const s of skills.filter((x) => x.hasActive).slice(0, 40)) {
    const active = await getActiveSkill(s.slug, db).catch(() => null);
    if (!active) continue;
    for (const m of active.content.costModels) {
      catalog.push({
        trade: active.content.trade,
        modelId: m.id,
        modelLabel: m.labelAr,
        laborComponents: m.components
          .filter((c) => c.kind === "labor")
          .map((c) => ({ id: c.id, labelAr: c.labelAr })),
      });
    }
  }
  return catalog;
}

export default async function LaborRatesPage() {
  const rates = await listLaborRates();
  const catalog = await buildCatalog();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">أجور المهن اليومية</h1>
          <p className="mt-1 text-sm text-gray-500">
            سجّل أجرة اليوم لكل مهنة — وأضف الإنتاجية عند الحاجة.
          </p>
        </div>
        <AddLaborRateButton />
      </div>

      <DayLogForm catalog={catalog} />

      {rates.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500">
          لا توجد مهن بعد. اضغط «+ مهنة جديدة» للبدء.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {rates.map((rate) => (
            <LaborRateCard key={rate.id} rate={rate} />
          ))}
        </div>
      )}
    </div>
  );
}
