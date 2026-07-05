import type { CostModel } from "./skill-schema";
import type { PriceSnapshot } from "./types";
import { parseDecimalToMicro, roundDivHalfUp } from "./money";

const MICRO = 1_000_000n;

export interface ProjectOverrides {
  priceBook?: Record<string, number>;
  globalMarkupPct?: string;
  markupPctByTrade?: Record<string, string>;
  laborPremiumPct?: string;
  models?: Record<string, { wastePct?: string; markupPct?: string }>;
  // Phase B additions (each optional; absent = identity)
  laborBurdenPct?: string;                                  // percent -> opts.burdenNum
  profitPct?: string;                                       // percent
  locationFactor?: { labor?: string; material?: string };  // direct indices
  sizeFactor?: string;                                      // direct multiplier
  targetDate?: string;                                      // ISO date for the time index
}

// Burden is carried into evaluateCostModel as an integer percent (opts.burdenNum),
// NOT a snapshot price uplift — so it folds into the single labor division (roadmap §7.2).
export function burdenNumFromOverrides(o?: ProjectOverrides): bigint {
  if (!o?.laborBurdenPct) return 0n;
  return BigInt(Math.round(Number(o.laborBurdenPct)));
}

// Multiply labor keys by the labor index, material + equipment keys by the material
// index. Indices are direct multipliers (roundDivHalfUp(price*idx, MICRO)) — no /100.
export function applyLocationFactor(
  snapshot: PriceSnapshot,
  laborKeys: string[], materialKeys: string[], equipmentKeys: string[],
  o?: ProjectOverrides,
): PriceSnapshot {
  if (!o?.locationFactor) return snapshot;
  const out: PriceSnapshot = { ...snapshot };
  const scale = (keys: string[], idx?: string) => {
    if (!idx) return;
    const m = parseDecimalToMicro(idx);
    for (const k of keys) {
      if (!out[k]) continue;
      out[k] = { ...out[k], priceFils: Number(roundDivHalfUp(BigInt(out[k].priceFils) * m, MICRO)) };
    }
  };
  scale(laborKeys, o.locationFactor.labor);
  scale(materialKeys, o.locationFactor.material);
  scale(equipmentKeys, o.locationFactor.material); // equipment uses the material index (spec §5.5)
  return out;
}

// Latest index whose date <= the given date (mirrors getSnapshot's as-of logic).
function pickIndex(indices: Record<string, number>, date: string): number | null {
  let best: number | null = null, bestDate = "";
  for (const [d, v] of Object.entries(indices)) {
    if (d <= date && d >= bestDate) { best = v; bestDate = d; }
  }
  return best;
}

export function applyTimeIndex(
  snapshot: PriceSnapshot,
  indices: Record<string, number>,
  o?: ProjectOverrides,
): PriceSnapshot {
  if (!o?.targetDate) return snapshot;
  const target = pickIndex(indices, o.targetDate);
  if (target == null) return snapshot;
  const out: PriceSnapshot = { ...snapshot };
  for (const k of Object.keys(out)) {
    const base = pickIndex(indices, out[k].effectiveDate);
    if (base == null || base === 0) continue;
    const num = BigInt(Math.round(target * 1e6)), den = BigInt(Math.round(base * 1e6));
    out[k] = { ...out[k], priceFils: Number(roundDivHalfUp(BigInt(out[k].priceFils) * num, den)) };
  }
  return out;
}

export function applyPriceOverrides(snapshot: PriceSnapshot, o?: ProjectOverrides): PriceSnapshot {
  if (!o?.priceBook) return snapshot;
  const out: PriceSnapshot = { ...snapshot };
  for (const [key, priceFils] of Object.entries(o.priceBook)) {
    if (out[key]) out[key] = { ...out[key], priceFils };
  }
  return out;
}

export function applyModelOverrides(model: CostModel, trade: string, o?: ProjectOverrides): CostModel {
  if (!o) return model;
  const m = o.models?.[model.id];
  const markupPct =
    m?.markupPct ?? o.markupPctByTrade?.[trade] ?? o.globalMarkupPct ?? model.markupPct;
  const wastePct = m?.wastePct ?? model.wastePct;
  if (markupPct === model.markupPct && wastePct === model.wastePct) return model;
  return { ...model, markupPct, wastePct };
}

export function applyLaborPremiumToSnapshot(
  snapshot: PriceSnapshot,
  laborKeys: string[],
  o?: ProjectOverrides,
): PriceSnapshot {
  if (!o?.laborPremiumPct) return snapshot;
  const factor = parseDecimalToMicro(o.laborPremiumPct);
  const out: PriceSnapshot = { ...snapshot };
  for (const key of laborKeys) {
    if (!out[key]) continue;
    const premium = Number(roundDivHalfUp(BigInt(out[key].priceFils) * factor, 100n * 1_000_000n));
    out[key] = { ...out[key], priceFils: out[key].priceFils + premium };
  }
  return out;
}
