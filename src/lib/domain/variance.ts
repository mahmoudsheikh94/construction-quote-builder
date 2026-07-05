import { roundHalfAwayFromZero } from "./money";

export const VARIANCE_ALPHA_MICRO = 300_000n; // 0.30
export const CONFIDENCE_THRESHOLD = 5;
const ONE_MICRO = 1_000_000n;

// Recency-weighted EWMA in micro fixed-point: new = (1-a)*prev + a*actual, one rounding.
export function ewmaUpdate(prevValueMicro: bigint, actualMicro: bigint): bigint {
  const numer = (ONE_MICRO - VARIANCE_ALPHA_MICRO) * prevValueMicro + VARIANCE_ALPHA_MICRO * actualMicro;
  return roundHalfAwayFromZero(numer, ONE_MICRO);
}

export function normKey(_scope: string, parts: string[]): string {
  return parts.join(":");
}
