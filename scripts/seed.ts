import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { claudeCliAdapter } from "@/lib/ai/claude-cli";
import { draftTradeSkill, persistReviewedSkill, DRAFT_SCHEMA } from "@/lib/seed/seed-from-priced";

// Two modes:
//   draft:   npx tsx scripts/seed.ts draft <trade> <slug> <nameAr> <pricedDoc>  → writes seed-draft-<slug>.json for review
//   persist: npx tsx scripts/seed.ts persist <slug> <nameAr>                    → persists the reviewed json
async function main() {
  const [mode] = process.argv.slice(2);
  const adapter = claudeCliAdapter({ timeoutMs: 240_000 });
  if (mode === "draft") {
    const [, trade, slug, nameAr, doc] = process.argv.slice(2);
    const draft = await draftTradeSkill(adapter, trade, doc);
    const out = `seed-draft-${slug}.json`;
    writeFileSync(out, JSON.stringify({ slug, nameAr, ...draft }, null, 2));
    console.log(`✅ كُتبت المسودة إلى ${out} — راجعها ثم شغّل: npx tsx scripts/seed.ts persist ${slug} "${nameAr}"`);
  } else if (mode === "persist") {
    const [, slug, nameAr] = process.argv.slice(2);
    const file = `seed-draft-${slug}.json`;
    if (!existsSync(file)) throw new Error(`لا توجد مسودة ${file} — شغّل draft أولاً`);
    const d = JSON.parse(readFileSync(file, "utf8"));
    // A human may have hand-edited the draft (e.g. introduced a float priceFils or a
    // wrong unit). Re-validate before persisting — a malformed skill here would
    // silently mis-price every quote using this trade.
    const parsed = DRAFT_SCHEMA.safeParse({ skill: d.skill, priceBook: d.priceBook });
    if (!parsed.success) {
      throw new Error(`مسودة ${file} غير صالحة بعد التعديل اليدوي: ${parsed.error.message}`);
    }
    await persistReviewedSkill(slug, nameAr, parsed.data.skill, parsed.data.priceBook);
    console.log(`✅ فُعّلت مهارة ${slug} مع دفتر الأسعار.`);
  } else {
    console.log("الاستخدام: seed.ts draft <trade> <slug> <nameAr> <doc>  |  seed.ts persist <slug> <nameAr>");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
