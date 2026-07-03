import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function testClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("شغّل npx supabase start وعبّئ .env.local أولاً");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
