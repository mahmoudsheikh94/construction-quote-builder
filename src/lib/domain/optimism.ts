import { roundDivHalfUp } from "./money";

// Reference-class optimism uplift on the rollup total (D1). Not per line.
export function applyOptimismUplift(grandTotalFils: number, upliftPct: number | null): number {
  if (upliftPct == null) return grandTotalFils;
  return Number(roundDivHalfUp(BigInt(grandTotalFils) * BigInt(100 + upliftPct), 100n));
}
