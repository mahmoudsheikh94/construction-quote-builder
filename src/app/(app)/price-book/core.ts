// Pure price-book upsert logic — no "use server", so it can accept an injected client.
// The action wrapper passes the session (anon+RLS) client; tests pass a service client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { addPriceEntry } from "@/lib/db/price-book";
import { parseJDToFils } from "@/lib/domain/money";

export interface UpsertPriceEntryInput {
  key: string;
  labelAr: string;
  unit: string;
  priceJD: string;
}

export async function upsertPriceEntryCore(input: UpsertPriceEntryInput, db?: SupabaseClient): Promise<void> {
  const sc = db ?? (await createClient());
  await addPriceEntry({
    key: input.key,
    labelAr: input.labelAr,
    unit: input.unit,
    priceFils: parseJDToFils(input.priceJD),
  }, sc);
}
