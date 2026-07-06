"use server";
import { revalidatePath } from "next/cache";
import { applyCorrectionCore, type CorrectionInput } from "./core";
import { saveProjectSettingsCore, type ProjectSettingsInput } from "./settings-core";
import { saveConditionsCore, type ConditionsInput } from "./conditions-core";

// A "use server" module may only export async functions — no type re-exports.
// Consumers import CorrectionInput / ProjectSettingsInput from their core modules.

// Server action wrapper: runs the core with the session (RLS) client, then revalidates.
export async function applyCorrection(quoteId: string, input: CorrectionInput): Promise<void> {
  await applyCorrectionCore(input);
  revalidatePath(`/quotes/${quoteId}`);
}

export async function saveProjectSettings(quoteId: string, input: ProjectSettingsInput): Promise<void> {
  await saveProjectSettingsCore(quoteId, input);
  revalidatePath(`/quotes/${quoteId}`);
}

export async function saveConditions(quoteId: string, input: ConditionsInput): Promise<void> {
  await saveConditionsCore(quoteId, input);
  revalidatePath(`/quotes/${quoteId}`);
}
