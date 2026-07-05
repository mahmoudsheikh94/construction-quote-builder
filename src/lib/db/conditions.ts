import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "./client";
import type { ConditionSeedTables } from "@/lib/domain/productivity";

// Load all 7 condition seed tables into the in-memory shape computeLossMultiplier expects.
export async function getConditionSeedTables(db: SupabaseClient = serviceClient()): Promise<ConditionSeedTables> {
  const [mcaa, neca, ot, height, floor, weather, shift] = await Promise.all([
    db.from("mcaa_factors").select("key, minor_pct, avg_pct, severe_pct"),
    db.from("neca_conditions").select("key"),
    db.from("overtime_pi").select("hours_per_week, week_number, index_value"),
    db.from("height_bands").select("min_ft, max_ft, uplift_pct"),
    db.from("floor_bands").select("min_floors, max_floors, uplift_pct"),
    db.from("weather_bands").select("exposure, uplift_pct"),
    db.from("shift_bands").select("shift_type, uplift_pct"),
  ]);

  const mcaaMap: ConditionSeedTables["mcaa"] = {};
  for (const r of mcaa.data ?? []) mcaaMap[r.key] = { minor: r.minor_pct, average: r.avg_pct, severe: r.severe_pct };

  const otMap: Record<string, number> = {};
  for (const r of ot.data ?? []) otMap[`${r.hours_per_week}:${r.week_number}`] = Number(r.index_value);

  const weatherMap: Record<string, number> = {};
  for (const r of weather.data ?? []) weatherMap[r.exposure] = r.uplift_pct;

  const shiftMap: Record<string, number> = {};
  for (const r of shift.data ?? []) shiftMap[r.shift_type] = r.uplift_pct;

  return {
    mcaa: mcaaMap,
    neca: (neca.data ?? []).map((r) => r.key),
    overtimePi: otMap,
    heightBands: (height.data ?? []).map((r) => ({ minFt: r.min_ft, maxFt: r.max_ft, upliftPct: r.uplift_pct })),
    floorBands: (floor.data ?? []).map((r) => ({ minFloors: r.min_floors, maxFloors: r.max_floors, upliftPct: r.uplift_pct })),
    weatherBands: weatherMap,
    shiftBands: shiftMap,
  };
}
