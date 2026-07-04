// Pure trade-save/rollback logic — no "use server", so it can accept an injected client.
// The action wrappers pass the session (anon+RLS) client; tests pass a service client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createSkill, createSkillVersion, activateSkillVersion } from "@/lib/db/skills";
import { addPriceEntry } from "@/lib/db/price-book";
import { SkillContentSchema, type SkillContent, type CostModel } from "@/lib/domain/skill-schema";
import { parseJDToFils } from "@/lib/domain/money";
import type { CanonicalUnit } from "@/lib/domain/types";

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

export interface NewTradeInput {
  slug: string;
  nameAr: string;
  // First cost model + its price (the popup captures one to make a usable trade).
  modelLabelAr: string;
  unit: CanonicalUnit;
  priceJD: string;
  markupPct: string; // e.g. "10"
}

// Create a new trade with one cost model + its price-book entry, in one shot.
// Writes the price entry, builds a valid SkillContent, then creates+activates version 1.
export async function createTradeCore(input: NewTradeInput, db?: SupabaseClient): Promise<void> {
  const sc = db ?? (await createClient());
  const slug = input.slug.trim();
  const priceBookKey = `${slug}_${input.unit}`;

  // 1) the price for the first cost model.
  await addPriceEntry({
    key: priceBookKey,
    labelAr: input.modelLabelAr,
    unit: input.unit,
    priceFils: parseJDToFils(input.priceJD),
  }, sc);

  // 2) one cost model referencing that price (single material component, qty 1 per unit).
  const model: CostModel = {
    id: `${slug}.model1`,
    labelAr: input.modelLabelAr,
    unit: input.unit,
    keywords: [input.modelLabelAr],
    components: [{
      id: `${slug}.model1.mat`,
      kind: "material",
      labelAr: input.modelLabelAr,
      priceBookKey,
      qtyPerUnit: "1",
    }],
    wastePct: "0",
    markupPct: (input.markupPct.trim() || "0"),
  };
  const content = SkillContentSchema.parse({ trade: slug, costModels: [model] }); // throws on invalid

  // 3) create the skill + activate version 1.
  const skill = await createSkill(slug, input.nameAr.trim(), sc);
  const v = await createSkillVersion(skill.id, content, "إنشاء المهنة", sc);
  await activateSkillVersion(skill.id, v.id, sc);
}
