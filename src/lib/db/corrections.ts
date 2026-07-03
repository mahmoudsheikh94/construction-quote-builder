import { serviceClient } from "./client";

export async function logCorrection(input: {
  lineItemId: string; beforeFils: number | null; afterFils: number;
  scope: "quote" | "trade"; userId?: string;
}): Promise<void> {
  const { error } = await serviceClient().from("corrections").insert({
    line_item_id: input.lineItemId, before_fils: input.beforeFils,
    after_fils: input.afterFils, scope: input.scope, user_id: input.userId,
  });
  if (error) throw error;
}
