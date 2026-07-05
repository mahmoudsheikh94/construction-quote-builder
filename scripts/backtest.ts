import "./_env";
import { claudeCliAdapter } from "../src/lib/ai/claude-cli";
import { runPipeline } from "../src/lib/pipeline/run";
import { scoreQuote } from "../src/lib/backtest/score";
import {
  getGoldenLines, listScoredCases, getCaseBySlug, saveBacktestRun, getRunsByLabel,
} from "../src/lib/db/golden";

// npm run backtest [-- --case <slug>] [-- --label <name>] [-- --compare <a> <b>]
// Re-runs the full pipeline per scored case and scores the result against golden
// truth. --compare diffs two labelled runs (the A/B gate).
async function main() {
  const argv = process.argv;
  const arg = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
  const caseArg = arg("--case");
  const label = arg("--label");

  if (argv.includes("--compare")) {
    const i = argv.indexOf("--compare");
    await runCompare(argv[i + 1], argv[i + 2]);
    return;
  }

  const adapter = claudeCliAdapter({ timeoutMs: 240_000 });
  const cases = caseArg
    ? [await getCaseBySlug(caseArg).then((c) => {
        if (!c) throw new Error(`no case ${caseArg}`);
        if (c.truthSource === "none") throw new Error(`case ${caseArg} has no ground truth`);
        return c;
      })]
    : await listScoredCases();

  for (const c of cases) {
    const priced = await runPipeline({ file: c.inputPath, profileSlug: c.profileSlug, adapter });
    const golden = await getGoldenLines(c.id);
    const summary = scoreQuote({ pricedRows: priced.rows, goldenLines: golden });
    await saveBacktestRun({ caseId: c.id, label, config: { asOf: null }, summary });
    console.log(
      `${c.slug} [${c.projectType}]  within10=${summary.within10}%  median=${summary.medianAbsBps}bps  ` +
      `grandTotalDev=${summary.grandTotalDevBps}bps  coverage=${summary.coverage}%`,
    );
  }
}

// A/B gate: for each case present in both labels, diff median + grand-total deviation.
async function runCompare(a: string, b: string) {
  const ra = await getRunsByLabel(a);
  const rb = await getRunsByLabel(b);
  const byCaseB = new Map(rb.map((r) => [r.case_id, r]));
  for (const r of ra) {
    const other = byCaseB.get(r.case_id);
    if (!other) continue;
    const med = (n: unknown) => (typeof n === "number" ? n : 0);
    const dMed = med(other.summary.medianAbsBps) - med(r.summary.medianAbsBps);
    const dGt = Math.abs(med(other.summary.grandTotalDevBps)) - Math.abs(med(r.summary.grandTotalDevBps));
    const verdict = dMed < 0 || dGt < 0 ? "improved" : dMed > 0 || dGt > 0 ? "regressed" : "neutral";
    console.log(`case ${r.case_id}: median ${dMed >= 0 ? "+" : ""}${dMed}bps, grandTotalDev ${dGt >= 0 ? "+" : ""}${dGt}bps → ${verdict}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
