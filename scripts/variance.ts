import "./_env";
import { listDayLog } from "../src/lib/db/day-log";
import { getLearnedNorms, upsertLearnedNorm } from "../src/lib/db/learned-norms";
import { runVarianceCore } from "../src/lib/domain/variance-core";

// npm run variance
// Idempotent batch: reprocess all day-log rows into learned_norms via EWMA.
async function main() {
  const rows = await listDayLog();
  const existing = await getLearnedNorms();
  const next = runVarianceCore(rows, existing);
  for (const norm of next.values()) await upsertLearnedNorm(norm);
  console.log(`variance: updated ${next.size} norm(s) from ${rows.length} day-log row(s)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
