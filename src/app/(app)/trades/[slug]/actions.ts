"use server";
import { revalidatePath } from "next/cache";
import { saveTradeCore, rollbackCore } from "./core";
import type { SkillContent } from "@/lib/domain/skill-schema";

// Server action wrappers: run the core with the session (RLS) client, then revalidate.
export async function saveTrade(input: { slug: string; nameAr: string; content: SkillContent; changelog: string }) {
  await saveTradeCore(input);
  revalidatePath(`/trades/${input.slug}`);
}

export async function rollback(slug: string, versionId: string) {
  await rollbackCore(slug, versionId);
  revalidatePath(`/trades/${slug}`);
}
