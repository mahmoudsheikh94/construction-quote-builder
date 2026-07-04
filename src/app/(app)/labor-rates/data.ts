import { createClient } from "@/lib/supabase/server";
import type { LaborRate } from "./types";

// Reads via the session (RLS) client — only authenticated users behind the login
// gate see rows, consistent with the rest of the app.
export async function listLaborRates(): Promise<LaborRate[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("labor_rates")
    .select("*, labor_rate_productivity(*)")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return data as LaborRate[];
}
