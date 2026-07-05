import { getQuote } from "@/lib/db/quotes";
import { createClient } from "@/lib/supabase/server";
import { getOptimismUplift } from "@/lib/db/risk-seed";
import { buildQuoteRange } from "@/lib/domain/range";
import { filsToJDString } from "@/lib/domain/money";
import { QuoteTable } from "./QuoteTable";
import { ProjectSettingsForm } from "./ProjectSettingsForm";
import { ConditionsForm, type McaaFactor, type NecaRow } from "./ConditionsForm";

export default async function QuoteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const quote = await getQuote(id, db);

  const [{ data: mcaaData }, { data: necaData }] = await Promise.all([
    db.from("mcaa_factors").select("key, label_ar, minor_pct, avg_pct, severe_pct").order("key"),
    db.from("neca_conditions").select("key, label_ar").order("key"),
  ]);
  const mcaaFactors: McaaFactor[] = (mcaaData ?? []).map((r) => ({
    key: r.key, labelAr: r.label_ar, minor: r.minor_pct, average: r.avg_pct, severe: r.severe_pct,
  }));
  const necaRows: NecaRow[] = (necaData ?? []).map((r) => ({ key: r.key, labelAr: r.label_ar }));

  const grandTotalFils = quote.lines.reduce((sum, l) => sum + (l.amount_fils ?? 0), 0);
  const optimismPct = quote.settings.archetype && quote.settings.estimateClass
    ? await getOptimismUplift(quote.settings.archetype, quote.settings.estimateClass, db)
    : null;
  const range = buildQuoteRange({
    grandTotalFils,
    estimateClass: quote.settings.estimateClass,
    optimismPct,
    contingencyPct: quote.settings.contingencyPct,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">{quote.name ?? id}</h1>
        <a href={`/quotes/${id}/export`} className="text-blue-700 text-sm">تصدير Excel</a>
      </div>

      <div className="border border-gray-200 rounded-xl bg-white p-5">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-gray-900">{filsToJDString(range.point)}</span>
          <span className="text-sm text-gray-500">د.أ</span>
          {range.low != null && range.high != null && (
            <span className="text-sm text-gray-500">
              (النطاق {filsToJDString(range.low)} – {filsToJDString(range.high)})
            </span>
          )}
        </div>
        {range.p80 != null && (
          <p className="text-xs text-gray-500 mt-1">
            P50 {filsToJDString(range.p50)} · P80 {filsToJDString(range.p80)} د.أ
          </p>
        )}
      </div>

      <ProjectSettingsForm quoteId={id} settings={quote.settings} />
      <ConditionsForm quoteId={id} mcaaFactors={mcaaFactors} necaRows={necaRows} initialMode="mcaa" />
      <QuoteTable quoteId={id} lines={quote.lines} />
    </div>
  );
}
