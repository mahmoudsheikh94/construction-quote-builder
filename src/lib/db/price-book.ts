import { serviceClient } from "./client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PriceSnapshot } from "@/lib/domain/types";

export async function addPriceEntry(input: {
  key: string; labelAr: string; unit: string; priceFils: number; effectiveDate?: string;
}, db: SupabaseClient = serviceClient()) {
  const { data, error } = await db
    .from("price_book_entries")
    .insert({
      key: input.key, label_ar: input.labelAr, unit: input.unit,
      price_fils: input.priceFils, effective_date: input.effectiveDate,
    })
    .select("id").single();
  if (error) throw error;
  return data;
}

export async function getSnapshot(asOf?: string, db: SupabaseClient = serviceClient()): Promise<PriceSnapshot> {
  const date = asOf ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await db
    .from("price_book_entries")
    .select("id, key, unit, price_fils, effective_date, created_at")
    .lte("effective_date", date)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const snapshot: PriceSnapshot = {};
  for (const row of data) {
    if (!snapshot[row.key]) {
      snapshot[row.key] = {
        priceFils: Number(row.price_fils), entryId: row.id,
        effectiveDate: row.effective_date, unit: row.unit,
      };
    }
  }
  return snapshot;
}

export async function getHistory(key: string, db: SupabaseClient = serviceClient()) {
  const { data, error } = await db
    .from("price_book_entries")
    .select("price_fils, effective_date")
    .eq("key", key)
    .order("effective_date", { ascending: false });
  if (error) throw error;
  return data.map((r) => ({ priceFils: Number(r.price_fils), effectiveDate: r.effective_date }));
}
