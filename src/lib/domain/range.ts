import { roundDivHalfUp } from "./money";
import { applyOptimismUplift } from "./optimism";
import { applyEstimateBand } from "./estimate-band";

export interface QuoteRange {
  point: number;
  low: number | null;
  high: number | null;
  class: number | null;
  p50: number;
  p80: number | null;
}

// Compose the honest range (roadmap §7.2 order): pt = grandTotal after the D1
// optimism uplift; the AACE ±band and P80 both anchor to pt. P50 == pt (the uplift
// is the only correction on the central value — P50 does not re-add it).
export function buildQuoteRange(input: {
  grandTotalFils: number;
  estimateClass: number | null;
  optimismPct: number | null;
  contingencyPct: number | null;
}): QuoteRange {
  const pt = applyOptimismUplift(input.grandTotalFils, input.optimismPct);
  const band = applyEstimateBand(pt, input.estimateClass);
  const p80 = input.contingencyPct == null
    ? null
    : Number(roundDivHalfUp(BigInt(pt) * BigInt(100 + input.contingencyPct), 100n));
  return { point: pt, low: band.low, high: band.high, class: band.class, p50: pt, p80 };
}
