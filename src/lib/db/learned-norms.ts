import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "./client";

export interface LearnedNorm {
  scope: string;
  key: string;
  value: number;
  sampleSize: number;
}

// Keyed by `${scope} ${key}` for O(1) lookup in the pricing path.
export async function getLearnedNorms(db: SupabaseClient = serviceClient()): Promise<Map<string, LearnedNorm>> {
  const { data } = await db.from("learned_norms").select("scope, key, value, sample_size");
  const map = new Map<string, LearnedNorm>();
  for (const r of data ?? []) {
    map.set(`${r.scope} ${r.key}`, { scope: r.scope, key: r.key, value: Number(r.value), sampleSize: r.sample_size });
  }
  return map;
}

export async function upsertLearnedNorm(n: LearnedNorm, db: SupabaseClient = serviceClient()): Promise<void> {
  const { error } = await db
    .from("learned_norms")
    .upsert(
      { scope: n.scope, key: n.key, value: n.value, sample_size: n.sampleSize, updated_at: new Date().toISOString() },
      { onConflict: "scope,key" },
    );
  if (error) throw new Error(error.message);
}
