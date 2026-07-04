// Pure trade-save/rollback logic — no "use server", so it can accept an injected client.
// The action wrappers pass the session (anon+RLS) client; tests pass a service client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createSkill, createSkillVersion, activateSkillVersion } from "@/lib/db/skills";
import { SkillContentSchema, type SkillContent } from "@/lib/domain/skill-schema";

async function skillIdBySlug(slug: string, nameAr: string, db: SupabaseClient): Promise<string> {
  const { data } = await db.from("trade_skills").select("id").eq("slug", slug).maybeSingle();
  if (data) return data.id;
  const created = await createSkill(slug, nameAr, db);
  return created.id;
}

export async function saveTradeCore(
  input: { slug: string; nameAr: string; content: SkillContent; changelog: string },
  db?: SupabaseClient,
) {
  const sc = db ?? (await createClient());
  const content = SkillContentSchema.parse(input.content); // throws on invalid
  const skillId = await skillIdBySlug(input.slug, input.nameAr, sc);
  const v = await createSkillVersion(skillId, content, input.changelog, sc);
  await activateSkillVersion(skillId, v.id, sc);
}

export async function rollbackCore(slug: string, versionId: string, db?: SupabaseClient) {
  const sc = db ?? (await createClient());
  const { data } = await sc.from("trade_skills").select("id").eq("slug", slug).single();
  await activateSkillVersion(data!.id, versionId, sc);
}
