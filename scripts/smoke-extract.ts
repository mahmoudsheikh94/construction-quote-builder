import { claudeCliAdapter } from "../src/lib/ai/claude-cli";
import { ingestPdf } from "../src/lib/ingest/pdf";
import { ingestExcel } from "../src/lib/ingest/excel";

// Live smoke: extract a real reference BOQ with the REAL claude CLI, print the
// line count + first few lines. Proves the vision extraction path end-to-end.
//   npx tsx scripts/smoke-extract.ts <path> [chunkSize] [maxChunks]
// maxChunks bounds cost on a first run (each chunk is a real, billed vision call).
async function main() {
  const path = process.argv[2] ?? "reference-docs/جدول الكميات بدون اسعار.pdf";
  const chunkSize = Number(process.argv[3] ?? 4);
  const maxChunks = process.argv[4] ? Number(process.argv[4]) : undefined;

  if (/\.xlsx?$|\.xlsm$/i.test(path)) {
    const { lines, warnings } = ingestExcel(path);
    console.log(`استُخرج ${lines.length} بنداً من ${path} (Excel)`);
    console.log(JSON.stringify(lines.slice(0, 5), null, 2));
    if (warnings.length) console.log("تحذيرات:", warnings.slice(0, 10));
    return;
  }

  const adapter = claudeCliAdapter({ timeoutMs: 240_000 });
  const { lines, warnings } = await ingestPdf(path, adapter, { chunkSize, maxChunks });
  console.log(`استُخرج ${lines.length} بنداً من ${path}`);
  console.log(JSON.stringify(lines.slice(0, 5), null, 2));
  if (warnings.length) console.log("تحذيرات:", warnings.slice(0, 10));
}
main().catch((e) => { console.error(e); process.exit(1); });
