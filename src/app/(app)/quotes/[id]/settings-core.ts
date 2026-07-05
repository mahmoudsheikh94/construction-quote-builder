// Persist a quote's project-settings (columns + overrides jsonb), then reprice.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { repriceQuoteCore } from "./reprice-core";

export interface ProjectSettingsInput {
  grossFloorAreaM2?: string;
  storeys?: string;
  avgStoreyHeightM?: string;
  estimateClass?: string; // "1".."5" or ""
  targetDate?: string;
  region?: string;
  profitPct?: string;
  locationFactorLabor?: string;
  locationFactorMaterial?: string;
  archetype?: string;
  siteClass?: string;
  contingencyPct?: string;
}

const num = (s?: string) => (s == null || s === "" ? null : Number(s));

export async function saveProjectSettingsCore(
  quoteId: string, input: ProjectSettingsInput, db?: SupabaseClient,
): Promise<void> {
  const sc = db ?? (await createClient());

  // Build the overrides jsonb from the per-quote pricing fields.
  const overrides: Record<string, unknown> = {};
  if (input.profitPct) overrides.profitPct = input.profitPct;
  if (input.locationFactorLabor || input.locationFactorMaterial) {
    overrides.locationFactor = { labor: input.locationFactorLabor || undefined, material: input.locationFactorMaterial || undefined };
  }
  if (input.targetDate) overrides.targetDate = input.targetDate;

  await sc.from("quotes").update({
    gross_floor_area_m2: num(input.grossFloorAreaM2),
    storeys: num(input.storeys),
    avg_storey_height_m: num(input.avgStoreyHeightM),
    estimate_class: num(input.estimateClass),
    target_date: input.targetDate || null,
    region: input.region || null,
    archetype: input.archetype || null,
    site_class: input.siteClass || null,
    contingency_pct: num(input.contingencyPct),
    overrides,
  }).eq("id", quoteId);

  await repriceQuoteCore(quoteId, sc);
}
