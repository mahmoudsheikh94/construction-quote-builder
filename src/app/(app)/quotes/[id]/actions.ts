"use server";
import { serviceClient } from "@/lib/db/client";
import { addPriceEntry } from "@/lib/db/price-book";
import { logCorrection } from "@/lib/db/corrections";
import { parseJDToFils, lineAmountFils } from "@/lib/domain/money";
import { revalidatePath } from "next/cache";

export interface CorrectionInput {
  lineItemId: string;
  newRateJD: string;
  quantityThousandths: number | null;
  scope: "quote" | "trade";
  priceBookKey?: string;
  unit?: string;
  labelAr?: string;
}

// Pure core (testable without Next request context).
export async function applyCorrectionCore(input: CorrectionInput): Promise<void> {
  const sc = serviceClient();
  const newRateFils = parseJDToFils(input.newRateJD);
  const amountFils = input.quantityThousandths === null ? null : lineAmountFils(input.quantityThousandths, newRateFils);

  const { data: before } = await sc.from("line_items").select("rate_fils").eq("id", input.lineItemId).single();
  const { error } = await sc.from("line_items")
    .update({ rate_fils: newRateFils, amount_fils: amountFils }).eq("id", input.lineItemId);
  if (error) throw error;
  await logCorrection({ lineItemId: input.lineItemId, beforeFils: before?.rate_fils ?? null, afterFils: newRateFils, scope: input.scope });

  if (input.scope === "trade" && input.priceBookKey && input.unit) {
    await addPriceEntry({ key: input.priceBookKey, labelAr: input.labelAr ?? input.priceBookKey, unit: input.unit, priceFils: newRateFils });
  }
}

// Server action wrapper (revalidates the page).
export async function applyCorrection(quoteId: string, input: CorrectionInput): Promise<void> {
  await applyCorrectionCore(input);
  revalidatePath(`/quotes/${quoteId}`);
}
