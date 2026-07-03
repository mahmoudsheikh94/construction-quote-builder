"use server";
import { serviceClient } from "@/lib/db/client";
import { createSkill, createSkillVersion, activateSkillVersion } from "@/lib/db/skills";
import { SkillContentSchema, type SkillContent } from "@/lib/domain/skill-schema";
import { revalidatePath } from "next/cache";

async function skillIdBySlug(slug: string, nameAr: string): Promise<string> {
  const sc = serviceClient();
  const { data } = await sc.from("trade_skills").select("id").eq("slug", slug).maybeSingle();
  if (data) return data.id;
  const created = await createSkill(slug, nameAr);
  return created.id;
}

// Pure core (testable without Next request context).
export async function saveTradeCore(input: { slug: string; nameAr: string; content: SkillContent; changelog: string }) {
  const content = SkillContentSchema.parse(input.content); // throws on invalid
  const skillId = await skillIdBySlug(input.slug, input.nameAr);
  const v = await createSkillVersion(skillId, content, input.changelog);
  await activateSkillVersion(skillId, v.id);
}

// Server action wrapper (revalidates the page).
export async function saveTrade(input: { slug: string; nameAr: string; content: SkillContent; changelog: string }) {
  await saveTradeCore(input);
  revalidatePath(`/trades/${input.slug}`);
}

export async function rollbackCore(slug: string, versionId: string) {
  const sc = serviceClient();
  const { data } = await sc.from("trade_skills").select("id").eq("slug", slug).single();
  await activateSkillVersion(data!.id, versionId);
}

export async function rollback(slug: string, versionId: string) {
  await rollbackCore(slug, versionId);
  revalidatePath(`/trades/${slug}`);
}
