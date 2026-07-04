// Pure correction logic — no "use server", so it can accept an injected client.
// The action wrapper passes the session (anon+RLS) client; tests pass a service client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { addPriceEntry } from "@/lib/db/price-book";
import { logCorrection } from "@/lib/db/corrections";
import { parseJDToFils, lineAmountFils } from "@/lib/domain/money";

export interface CorrectionInput {
  lineItemId: string;
  newRateJD: string;
  quantityThousandths: number | null;
  scope: "quote" | "trade";
  priceBookKey?: string;
  unit?: string;
  labelAr?: string;
}

export async function applyCorrectionCore(input: CorrectionInput, db?: SupabaseClient): Promise<void> {
  const sc = db ?? (await createClient());
  const newRateFils = parseJDToFils(input.newRateJD);
  const amountFils = input.quantityThousandths === null ? null : lineAmountFils(input.quantityThousandths, newRateFils);

  const { data: before } = await sc.from("line_items").select("rate_fils").eq("id", input.lineItemId).single();
  const { error } = await sc.from("line_items")
    .update({ rate_fils: newRateFils, amount_fils: amountFils }).eq("id", input.lineItemId);
  if (error) throw error;
  await logCorrection({ lineItemId: input.lineItemId, beforeFils: before?.rate_fils ?? null, afterFils: newRateFils, scope: input.scope }, sc);

  if (input.scope === "trade" && input.priceBookKey && input.unit) {
    await addPriceEntry({ key: input.priceBookKey, labelAr: input.labelAr ?? input.priceBookKey, unit: input.unit, priceFils: newRateFils }, sc);
  }
}
