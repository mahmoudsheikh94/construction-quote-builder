import type { ScoreSummary } from "./types";

// The A/B gate (spec §8): a candidate becomes a default only if it does NOT regress
// grand-total deviation or median error, AND improves at least one of them. A
// candidate that only helps one project-type segment ships type-scoped (the caller
// runs gateVerdict per segment). All values are basis points; |grandTotalDev| is
// compared (direction-agnostic — a big under-estimate is as bad as a big over-estimate).
export function gateVerdict(
  baseline: ScoreSummary,
  candidate: ScoreSummary,
): { pass: boolean; reason: string } {
  const bMed = baseline.medianAbsBps ?? Infinity;
  const cMed = candidate.medianAbsBps ?? Infinity;
  const bGt = Math.abs(baseline.grandTotalDevBps ?? Infinity);
  const cGt = Math.abs(candidate.grandTotalDevBps ?? Infinity);
  const regressed = cMed > bMed || cGt > bGt;
  const improved = cMed < bMed || cGt < bGt;
  if (regressed) {
    return { pass: false, reason: `regressed: median ${bMed}->${cMed}bps, |grandTotalDev| ${bGt}->${cGt}bps` };
  }
  if (!improved) return { pass: false, reason: "no improvement on any segment" };
  return { pass: true, reason: `improved: median ${bMed}->${cMed}bps, |grandTotalDev| ${bGt}->${cGt}bps` };
}
