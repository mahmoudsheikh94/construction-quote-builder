import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "./client";

export async function getLocationFactors(
  db: SupabaseClient = serviceClient(),
): Promise<Record<string, { labor: number; material: number }>> {
  const { data } = await db.from("location_factors").select("region, labor_index, material_index");
  const out: Record<string, { labor: number; material: number }> = {};
  for (const r of data ?? []) out[r.region] = { labor: Number(r.labor_index), material: Number(r.material_index) };
  return out;
}

export async function getCostIndices(db: SupabaseClient = serviceClient()): Promise<Record<string, number>> {
  const { data } = await db.from("cost_indices").select("effective_date, index_value");
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.effective_date] = Number(r.index_value);
  return out;
}

export async function getWasteDefaults(db: SupabaseClient = serviceClient()): Promise<Record<string, string>> {
  const { data } = await db.from("material_waste_defaults").select("material_category, waste_pct");
  const out: Record<string, string> = {};
  for (const r of data ?? []) out[r.material_category] = String(r.waste_pct);
  return out;
}

export async function getSizeCurves(
  db: SupabaseClient = serviceClient(),
): Promise<Record<string, { refSizeM2: number; exponent: number }>> {
  const { data } = await db.from("size_curves").select("facility_type, ref_size_m2, exponent");
  const out: Record<string, { refSizeM2: number; exponent: number }> = {};
  for (const r of data ?? []) out[r.facility_type] = { refSizeM2: Number(r.ref_size_m2), exponent: Number(r.exponent) };
  return out;
}
