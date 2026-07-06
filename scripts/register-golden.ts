import "./_env";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { insertGoldenCase, getCaseBySlug, type GoldenCaseInput } from "../src/lib/db/golden";

// Scored cases — human-priced truth on disk today. priced_path holds the human
// prices; input_path is the price-stripped copy the pipeline ingests.
const SCORED: GoldenCaseInput[] = [
  {
    slug: "omar-matar-9b-civil", nameAr: "عمر مطر 9ب مدني", projectType: "civil",
    inputPath: "reference-docs/Omar Matar Street without price.pdf",
    pricedPath: "reference-docs/Package 8 & 9 B Omar Matar Street with price.pdf",
    profileSlug: "civil", truthSource: "priced-tender",
  },
  {
    slug: "omar-matar-9a-structural-mep", nameAr: "عمر مطر 9أ إنشائي وميكانيك", projectType: "mep",
    inputPath: "reference-docs/Omar Matar Street without price.pdf",
    pricedPath: "reference-docs/Package 9 A Structural & MEP Works priced.pdf",
    profileSlug: "mep", truthSource: "priced-tender",
  },
  {
    slug: "omar-matar-9a-architectural", nameAr: "عمر مطر 9أ معماري", projectType: "architectural",
    inputPath: "reference-docs/Omar Matar Street without price.pdf",
    // NOTE: two spaces before "Works" — byte-exact filename on disk.
    pricedPath: "reference-docs/Package 9A Architectural  Works priced.pdf",
    profileSlug: "architectural", truthSource: "priced-tender",
  },
  {
    slug: "alsafi-civil", nameAr: "الصافي مدني", projectType: "civil",
    inputPath: "reference-docs/test-boqs/AlSafi_Civil.unpriced.xlsx",
    pricedPath: "reference-docs/test-boqs/AlSafi_Civil.xlsx",
    profileSlug: "civil", truthSource: "priced-tender",
  },
];

// Candidate cases — no human-priced truth yet. Registered but excluded from scoring.
const CANDIDATES: GoldenCaseInput[] = [
  { slug: "labs-fitout", nameAr: "مختبرات", projectType: "labs", inputPath: "reference-docs/test-boqs/Labs.xlsx", pricedPath: null, profileSlug: "civil", truthSource: "none" },
  { slug: "jah-amman", nameAr: "مستشفى", projectType: "hospital", inputPath: "reference-docs/test-boqs/JAH_Amman.xlsx", pricedPath: null, profileSlug: "civil", truthSource: "none" },
  { slug: "fountain-square", nameAr: "فاونتن سكوير", projectType: "infrastructure", inputPath: "reference-docs/Fountain Square  Bill 1 & 2 without price.pdf", pricedPath: null, profileSlug: "civil", truthSource: "none" },
];

async function main() {
  for (const c of [...SCORED, ...CANDIDATES]) {
    if (!existsSync(resolve(process.cwd(), c.inputPath))) throw new Error(`input_path missing: ${c.inputPath}`);
    if (c.pricedPath && !existsSync(resolve(process.cwd(), c.pricedPath))) throw new Error(`priced_path missing: ${c.pricedPath}`);
    if (await getCaseBySlug(c.slug)) {
      console.log(`${c.slug}: exists, skip`);
      continue;
    }
    await insertGoldenCase(c);
    console.log(`${c.slug}: registered`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
