// Pure firm-settings update — no "use server", so it accepts an injected client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { updateFirmSettings, type FirmSettings } from "@/lib/db/firm-settings";

export type FirmSettingsInput = Partial<FirmSettings>;

export async function updateFirmSettingsCore(input: FirmSettingsInput, db?: SupabaseClient): Promise<void> {
  const sc = db ?? (await createClient());
  await updateFirmSettings(input, sc);
}
