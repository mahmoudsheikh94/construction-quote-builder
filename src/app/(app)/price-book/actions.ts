"use server";
import { revalidatePath } from "next/cache";
import { upsertPriceEntryCore, type UpsertPriceEntryInput } from "./core";

export type { UpsertPriceEntryInput };

// Server action wrapper: runs the core with the session (RLS) client, then revalidates.
export async function upsertPriceEntry(input: UpsertPriceEntryInput): Promise<void> {
  await upsertPriceEntryCore(input);
  revalidatePath("/price-book");
}
