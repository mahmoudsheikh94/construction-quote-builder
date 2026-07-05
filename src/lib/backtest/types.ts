// A golden-line row as consumed by the scoring engine.
export interface GoldenLineRow {
  sortOrder: number;
  itemCode: string | null;
  descriptionOriginal: string;
  unitCanonical: string | null;
  truthRateFils: number | null;
  truthAmountFils: number | null;
  trade: string | null;
}

// Per-line scoring outcome.
export interface ScoredLine {
  position: number;
  matched: boolean;
  priced: boolean;
  eBps: number | null;
}

// Metrics for one trade (or the whole quote), in signed integer basis points.
export interface TradeMetrics {
  within5: number;
  within10: number;
  within20: number;
  medianAbsBps: number | null;
  meanSignedBps: number | null;
  count: number;
}

export interface ScoreSummary {
  within5: number; // % as integer 0..100
  within10: number;
  within20: number;
  medianAbsBps: number | null;
  meanSignedBps: number | null;
  grandTotalDevBps: number | null;
  coverage: number; // % of priced lines that aligned to truth
  byTrade: Record<string, TradeMetrics>;
  lines: ScoredLine[];
}
