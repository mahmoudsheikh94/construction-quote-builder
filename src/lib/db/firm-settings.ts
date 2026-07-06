import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "./client";

export interface FirmSettings {
  laborBurdenPct: string;
  overheadPct: string;
  defaultReferenceLocation: string | null;
}

const DEFAULTS: FirmSettings = { laborBurdenPct: "30", overheadPct: "15", defaultReferenceLocation: null };

// Single-row firm settings. Falls back to defaults if the row is somehow absent.
export async function getFirmSettings(db: SupabaseClient = serviceClient()): Promise<FirmSettings> {
  const { data } = await db
    .from("firm_settings")
    .select("labor_burden_pct, overhead_pct, default_reference_location")
    .eq("id", true)
    .maybeSingle();
  if (!data) return DEFAULTS;
  return {
    laborBurdenPct: String(data.labor_burden_pct ?? DEFAULTS.laborBurdenPct),
    overheadPct: String(data.overhead_pct ?? DEFAULTS.overheadPct),
    defaultReferenceLocation: data.default_reference_location ?? null,
  };
}

export async function updateFirmSettings(
  input: Partial<FirmSettings>,
  db: SupabaseClient = serviceClient(),
): Promise<void> {
  const patch: Record<string, unknown> = { id: true, updated_at: new Date().toISOString() };
  if (input.laborBurdenPct != null) patch.labor_burden_pct = input.laborBurdenPct;
  if (input.overheadPct != null) patch.overhead_pct = input.overheadPct;
  if (input.defaultReferenceLocation !== undefined) patch.default_reference_location = input.defaultReferenceLocation;
  const { error } = await db.from("firm_settings").upsert(patch, { onConflict: "id" });
  if (error) throw new Error(error.message);
}
