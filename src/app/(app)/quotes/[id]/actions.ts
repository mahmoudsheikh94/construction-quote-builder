"use server";
import { revalidatePath } from "next/cache";
import { applyCorrectionCore, type CorrectionInput } from "./core";

export type { CorrectionInput };

// Server action wrapper: runs the core with the session (RLS) client, then revalidates.
export async function applyCorrection(quoteId: string, input: CorrectionInput): Promise<void> {
  await applyCorrectionCore(input);
  revalidatePath(`/quotes/${quoteId}`);
}
