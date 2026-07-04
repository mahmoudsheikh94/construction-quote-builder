import { serviceClient } from "./client";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function logCorrection(input: {
  lineItemId: string; beforeFils: number | null; afterFils: number;
  scope: "quote" | "trade"; userId?: string;
}, db: SupabaseClient = serviceClient()): Promise<void> {
  const { error } = await db.from("corrections").insert({
    line_item_id: input.lineItemId, before_fils: input.beforeFils,
    after_fils: input.afterFils, scope: input.scope, user_id: input.userId,
  });
  if (error) throw error;
}
