// Persist a quote's site-condition inputs (MCAA factors or NECA scores), then reprice.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { repriceQuoteCore } from "./reprice-core";
import type { QuoteConditions } from "@/lib/domain/productivity";

export interface ConditionsInput {
  mode: "mcaa" | "neca";
  mcaa?: Array<{ key: string; severity: "minor" | "average" | "severe"; severeConfirmed?: boolean }>;
  neca?: { scores: Record<string, 1 | 2 | 3> };
}

export async function saveConditionsCore(quoteId: string, input: ConditionsInput, db?: SupabaseClient): Promise<void> {
  const sc = db ?? (await createClient());

  const conditions: QuoteConditions = { mode: input.mode, mcaa: input.mcaa, neca: input.neca };

  // Read the existing overrides, merge in conditionInput (repriceQuoteCore reads it there).
  const { data: q } = await sc.from("quotes").select("overrides").eq("id", quoteId).single();
  const overrides = { ...((q?.overrides as Record<string, unknown>) ?? {}), conditionInput: conditions };

  await sc.from("quotes").update({
    condition_mode: input.mode,
    condition_input: conditions,
    overrides,
  }).eq("id", quoteId);

  await repriceQuoteCore(quoteId, sc);
}
