import "./_env";
import { readFileSync } from "node:fs";
import { DRAFT_SCHEMA, persistReviewedSkill } from "../src/lib/seed/seed-from-priced";
import { createProfile, createProfileVersion, activateProfileVersion, getActiveProfile, getActiveSkill } from "../src/lib/db/skills";

// Seed the reviewed AlSafi civil skill + a `civil` project-type profile that includes
// it, so the golden case `alsafi-civil` (profile_slug=civil) can be priced + backtested.
// The draft is already human-reviewed (seed-drafts/alsafi-seed-v2.json) — no AI needed.
async function main() {
  const draft = JSON.parse(readFileSync("seed-drafts/alsafi-seed-v2.json", "utf8"));
  const parsed = DRAFT_SCHEMA.safeParse({ skill: draft.skill, priceBook: draft.priceBook });
  if (!parsed.success) throw new Error(`draft invalid: ${parsed.error.message}`);

  const tradeSlug = parsed.data.skill.trade; // "alsafi-civil"

  const existingSkill = await getActiveSkill(tradeSlug).catch(() => null);
  if (existingSkill) {
    console.log(`skill ${tradeSlug}: already active, skip`);
  } else {
    await persistReviewedSkill(tradeSlug, draft.nameAr, parsed.data.skill, parsed.data.priceBook);
    console.log(`skill ${tradeSlug}: seeded + activated (${parsed.data.priceBook.length} price entries)`);
  }

  const existingProfile = await getActiveProfile("civil").catch(() => null);
  if (existingProfile) {
    console.log("profile civil: already active, skip");
  } else {
    const { id } = await createProfile("civil", "أعمال مدنية");
    const { id: versionId } = await createProfileVersion(id, { trades: [tradeSlug], ratioChecks: [] }, "seed");
    await activateProfileVersion(id, versionId);
    console.log(`profile civil: seeded + activated with trades [${tradeSlug}]`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
