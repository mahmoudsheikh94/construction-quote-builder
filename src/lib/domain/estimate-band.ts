import { roundDivHalfUp } from "./money";

// AACE 18R-97 estimate-class bands (fixed industry values). The band is a
// rule-of-thumb confidence interval around the point estimate.
export const ESTIMATE_CLASS_BANDS: Record<1 | 2 | 3 | 4 | 5, { lowPct: number; highPct: number }> = {
  5: { lowPct: -50, highPct: 100 },
  4: { lowPct: -30, highPct: 50 },
  3: { lowPct: -20, highPct: 30 },
  2: { lowPct: -15, highPct: 20 },
  1: { lowPct: -10, highPct: 15 },
};

export interface EstimateBand {
  point: number;
  low: number | null;
  high: number | null;
  class: number | null;
}

// Extends the rollup with a ± band. Does NOT change the point. A null (or invalid)
// class shows the bare point with no band — the estimator never invents an interval.
export function applyEstimateBand(grandTotalFils: number, estimateClass: number | null): EstimateBand {
  if (estimateClass == null || !(estimateClass in ESTIMATE_CLASS_BANDS)) {
    return { point: grandTotalFils, low: null, high: null, class: null };
  }
  const { lowPct, highPct } = ESTIMATE_CLASS_BANDS[estimateClass as 1 | 2 | 3 | 4 | 5];
  const pt = BigInt(grandTotalFils);
  // 100+lowPct stays >= 50 (>=0), so roundDivHalfUp's n>=0 precondition holds.
  const low = Number(roundDivHalfUp(pt * BigInt(100 + lowPct), 100n));
  const high = Number(roundDivHalfUp(pt * BigInt(100 + highPct), 100n));
  return { point: grandTotalFils, low, high, class: estimateClass };
}
