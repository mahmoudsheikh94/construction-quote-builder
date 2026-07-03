import { writeFileSync } from "node:fs";
import { claudeCliAdapter } from "../src/lib/ai/claude-cli";
import { runPipeline } from "../src/lib/pipeline/run";
import { writePricedExcel } from "../src/lib/export/priced-boq";

// npm run pipeline -- --file <boq> --type <profileSlug> [--out <name>]
async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => { const i = args.indexOf(flag); return i === -1 ? undefined : args[i + 1]; };
  const file = get("--file"); const profileSlug = get("--type"); const out = get("--out") ?? "priced-boq";
  if (!file || !profileSlug) { console.error("الاستخدام: npm run pipeline -- --file <boq> --type <profileSlug>"); process.exit(1); }

  const adapter = claudeCliAdapter({ timeoutMs: 240_000 });
  const result = await runPipeline({ file, profileSlug, adapter });
  writeFileSync(`${out}.json`, JSON.stringify(result.json, null, 2));
  await writePricedExcel(`${out}.xlsx`, result.rows, result.rollup);
  const flagged = result.rows.filter((r) => r.flags.length).length;
  const grandTotalJD = (result.json as { grandTotalJD: string })["grandTotalJD"];
  console.log(`✅ سُعّر ${result.rows.length} بنداً (${flagged} بحاجة لمراجعة). المجموع: ${grandTotalJD} د.أ`);
  console.log(`   المخرجات: ${out}.json و ${out}.xlsx`);
}
main().catch((e) => { console.error(e); process.exit(1); });
