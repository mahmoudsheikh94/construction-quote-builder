"use server";
import { addPriceEntry } from "@/lib/db/price-book";
import { parseJDToFils } from "@/lib/domain/money";
import { revalidatePath } from "next/cache";

export interface UpsertPriceEntryInput {
  key: string;
  labelAr: string;
  unit: string;
  priceJD: string;
}

// Pure core (testable without Next request context).
export async function upsertPriceEntryCore(input: UpsertPriceEntryInput): Promise<void> {
  await addPriceEntry({
    key: input.key,
    labelAr: input.labelAr,
    unit: input.unit,
    priceFils: parseJDToFils(input.priceJD),
  });
}

// Server action wrapper (revalidates the page).
export async function upsertPriceEntry(input: UpsertPriceEntryInput): Promise<void> {
  await upsertPriceEntryCore(input);
  revalidatePath("/price-book");
}
