import { z } from "zod";
import type { AIAdapter } from "@/lib/ai/adapter";
import { SkillContentSchema, type SkillContent } from "@/lib/domain/skill-schema";
import { createSkill, createSkillVersion, activateSkillVersion } from "@/lib/db/skills";
import { addPriceEntry } from "@/lib/db/price-book";

const PriceBookDraft = z.array(z.object({
  key: z.string(), labelAr: z.string(), unit: z.string(), priceFils: z.number().int().nonnegative(),
}));
export const DRAFT_SCHEMA = z.object({ skill: SkillContentSchema, priceBook: PriceBookDraft });

const SEED_SYSTEM = `أنت مهندس تسعير خبير في السوق الأردني. من مستند جدول كميات مُسعّر، اشتقّ نماذج تسعير (cost models)
لهذه المهنة: لكل نموذج مكوّنات (مواد/عمالة/معدات) مع مفاتيح دفتر أسعار، ونِسَب الهدر والربح، وإنتاجية العمالة (وحدة/يوم).
هذا تقدير أولي للمراجعة البشرية. لا تُدرج الأسعار النهائية المخلوطة؛ فكّكها إلى مكوّنات. أعِد JSON بالشكل {"skill":{...},"priceBook":[...]}.`;

export async function draftTradeSkill(adapter: AIAdapter, trade: string, pricedExamplesPath: string) {
  const draft = await adapter.run<z.infer<typeof DRAFT_SCHEMA>>({
    system: SEED_SYSTEM,
    prompt: `المهنة: ${trade}. استخرج نماذج التسعير ومفاتيح دفتر الأسعار من المستند المُسعّر المرفق.`,
    files: pricedExamplesPath === "x" ? undefined : [pricedExamplesPath],
    schema: DRAFT_SCHEMA,
  });
  return draft;
}

export async function persistReviewedSkill(
  slug: string, nameAr: string, skill: SkillContent,
  priceBook: Array<{ key: string; labelAr: string; unit: string; priceFils: number }>,
): Promise<void> {
  for (const e of priceBook) {
    await addPriceEntry({ key: e.key, labelAr: e.labelAr, unit: e.unit, priceFils: e.priceFils });
  }
  const { id } = await createSkill(slug, nameAr);
  const v = await createSkillVersion(id, skill, "بذرة أولية من مثال مُسعّر (مراجَعة)");
  await activateSkillVersion(id, v.id);
}
