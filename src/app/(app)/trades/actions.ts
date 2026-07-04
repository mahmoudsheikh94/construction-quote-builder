"use server";
import { revalidatePath } from "next/cache";
import { createTradeCore, type NewTradeInput } from "./[slug]/core";

export type { NewTradeInput };

// Server action wrapper: creates the trade with the session (RLS) client, then revalidates.
export async function createTrade(input: NewTradeInput): Promise<void> {
  await createTradeCore(input);
  revalidatePath("/trades");
}
