import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { claudeCliAdapter } from "@/lib/ai/claude-cli";
import { draftTradeSkill, persistReviewedSkill } from "@/lib/seed/seed-from-priced";

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
    await persistReviewedSkill(slug, nameAr, d.skill, d.priceBook);
    console.log(`✅ فُعّلت مهارة ${slug} مع دفتر الأسعار.`);
  } else {
    console.log("الاستخدام: seed.ts draft <trade> <slug> <nameAr> <doc>  |  seed.ts persist <slug> <nameAr>");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
