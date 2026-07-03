import type { CostModel } from "./skill-schema";
import type { PriceSnapshot } from "./types";
import { parseDecimalToMicro, roundDivHalfUp } from "./money";

export interface ProjectOverrides {
  priceBook?: Record<string, number>;
  globalMarkupPct?: string;
  markupPctByTrade?: Record<string, string>;
  laborPremiumPct?: string;
  models?: Record<string, { wastePct?: string; markupPct?: string }>;
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
