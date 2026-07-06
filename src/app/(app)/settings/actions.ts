"use server";
import { revalidatePath } from "next/cache";
import { updateFirmSettingsCore, type FirmSettingsInput } from "./core";

// A "use server" module may only export async functions — no type re-exports.
// Consumers import FirmSettingsInput from ./core directly.
export async function saveFirmSettings(input: FirmSettingsInput): Promise<void> {
  await updateFirmSettingsCore(input);
  revalidatePath("/settings");
}
