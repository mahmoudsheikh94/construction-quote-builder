import "./_env"; // must be first — loads .env.local before any Supabase client is built
import { writeFileSync } from "node:fs";
import { claudeCliAdapter } from "../src/lib/ai/claude-cli";
import { runPipeline } from "../src/lib/pipeline/run";
import { writePricedExcel } from "../src/lib/export/priced-boq";
import { saveQuote } from "../src/lib/db/quotes";
import { parseJDToFils } from "../src/lib/domain/money";
import { normalizeUnit } from "../src/lib/domain/normalize";
import { parseQuantityToThousandths } from "../src/lib/domain/normalize";

// npm run pipeline -- --file <boq> --type <profileSlug> [--out <name>] [--name <اسم>]
async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => { const i = args.indexOf(flag); return i === -1 ? undefined : args[i + 1]; };
  const file = get("--file"); const profileSlug = get("--type");
  const out = get("--out") ?? "priced-boq"; const name = get("--name") ?? file?.split("/").pop() ?? "quote";
  if (!file || !profileSlug) { console.error("الاستخدام: npm run pipeline -- --file <boq> --type <profileSlug> [--name <اسم>]"); process.exit(1); }

  const adapter = claudeCliAdapter({ timeoutMs: 240_000 });
  const result = await runPipeline({ file, profileSlug, adapter });
  writeFileSync(`${out}.json`, JSON.stringify(result.json, null, 2));
  await writePricedExcel(`${out}.xlsx`, result.rows, result.rollup);

  // Persist to the shared DB so the web UI can show it.
  const saveRows = result.rows.map((r, i) => ({
    sortOrder: i, itemCode: r.itemCode, sectionRef: r.sectionRef, description: r.description,
    unitRaw: r.unit, unitCanonical: r.unit ? normalizeUnit(r.unit) : null,
    quantityThousandths: r.quantity ? safeQty(r.quantity) : null,
    itemType: "unit_rate" as const,
    rateFils: r.rateJD ? parseJDToFils(r.rateJD) : null,
    amountFils: r.amountJD ? parseJDToFils(r.amountJD) : null,
    flags: r.flags,
  }));
  const { quoteId } = await saveQuote({ name, rows: saveRows });
  const flagged = result.rows.filter((r) => r.flags.length).length;
  const grandTotalJD = (result.json as { grandTotalJD: string })["grandTotalJD"];
  console.log(`✅ سُعّر ${result.rows.length} بنداً (${flagged} بحاجة لمراجعة). المجموع: ${grandTotalJD} د.أ`);
  console.log(`   المخرجات: ${out}.json و ${out}.xlsx · حُفظت في قاعدة البيانات (${quoteId})`);
  if (result.ingestionWarnings.length > 0) {
    console.log(`⚠️  ${result.ingestionWarnings.length} تحذير(ات) استخراج — راجع البند قد يكون ناقصاً:`);
    for (const w of result.ingestionWarnings.slice(0, 5)) console.log(`   - ${w}`);
    if (result.ingestionWarnings.length > 5) console.log(`   … و ${result.ingestionWarnings.length - 5} أخرى`);
  }
}
function safeQty(s: string): number | null { try { return parseQuantityToThousandths(s); } catch { return null; } }
main().catch((e) => { console.error(e); process.exit(1); });
