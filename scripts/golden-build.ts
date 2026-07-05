import "./_env";
import { claudeCliAdapter } from "../src/lib/ai/claude-cli";
import { getCaseBySlug, insertGoldenLines } from "../src/lib/db/golden";
import { getActiveProfile, getActiveSkill } from "../src/lib/db/skills";
import { ingestExcel } from "../src/lib/ingest/excel";
import { ingestPdf } from "../src/lib/ingest/pdf";
import { batchTagLines, batchMatchLines } from "../src/lib/pipeline/batch";
import type { PricedExtractionResult } from "../src/lib/ingest/types";
import type { GoldenLineRow } from "../src/lib/backtest/types";

// npm run golden:build -- --case <slug>
// Parses the case's priced_path into golden_lines (truth prices) and resolves each
// line's trade via the same tag+match step the pipeline uses. One-time per case.
async function main() {
  const slug = process.argv[process.argv.indexOf("--case") + 1];
  if (!slug) throw new Error("usage: golden:build -- --case <slug>");
  const c = await getCaseBySlug(slug);
  if (!c) throw new Error(`no case ${slug}`);
  if (!c.pricedPath) throw new Error(`case ${slug} has no priced_path (truth_source=none)`);

  const adapter = claudeCliAdapter({ timeoutMs: 240_000 });
  const isExcel = /\.xlsx?$/i.test(c.pricedPath);
  const res = (isExcel
    ? ingestExcel(c.pricedPath, { readPrices: true })
    : await ingestPdf(c.pricedPath, adapter, { readPrices: true })) as PricedExtractionResult;

  // Build-time guard: refuse a pipeline-output artifact (mostly-null truth prices).
  const nullRate = res.lines.filter((l) => l.truthRateFils == null).length;
  if (res.lines.length > 0 && nullRate > res.lines.length * 0.5) {
    throw new Error(`>50% null truth rates in ${c.pricedPath} — is this a pipeline OUTPUT, not human truth?`);
  }

  // Trade resolution (§5.2): tag + match against the case's active profile skills.
  const profile = await getActiveProfile(c.profileSlug).catch(() => null);
  const tradeByIndex = new Array<string | null>(res.lines.length).fill(null);
  if (profile) {
    for (const tradeSlug of profile.content.trades) {
      const skill = await getActiveSkill(tradeSlug).catch(() => null);
      if (!skill) continue;
      const tags = await batchTagLines(adapter, tradeSlug, res.lines);
      const matches = await batchMatchLines(
        adapter, tradeSlug, skill.content,
        res.lines.map((l, i) => ({ rawText: l.descriptionOriginal, tags: tags[i] })),
      );
      matches.forEach((m, i) => { if (m && tradeByIndex[i] == null) tradeByIndex[i] = tradeSlug; });
    }
  }

  const lines: GoldenLineRow[] = res.lines.map((l, i) => ({
    sortOrder: l.sortOrder, itemCode: l.itemCode ?? null, descriptionOriginal: l.descriptionOriginal,
    unitCanonical: (l.unitRaw ?? null) as string | null,
    truthRateFils: l.truthRateFils ?? null, truthAmountFils: l.truthAmountFils ?? null, trade: tradeByIndex[i],
  }));
  await insertGoldenLines(c.id, lines);
  console.log(`${slug}: ${lines.length} golden lines written (${lines.filter((l) => l.trade).length} with a resolved trade)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
