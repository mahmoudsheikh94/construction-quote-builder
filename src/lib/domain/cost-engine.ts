import type { CostModel } from "./skill-schema";
import type { PriceSnapshot, RateBreakdown } from "./types";
import { parseDecimalToMicro, roundDivHalfUp } from "./money";

export class MissingPriceKeyError extends Error {
  constructor(public key: string) {
    super(`مفتاح سعر مفقود في دفتر الأسعار: ${key}`);
  }
}

const MICRO = 1_000_000n;
export const L_MICRO = 1_000_000n;

// Options carry the labor burden (an integer percent, e.g. 30n) and the Phase-C
// productivity loss multiplier L (as lMicro, a 1e6-scaled bigint). Both default to
// identity, so a 2-arg call reprices byte-identically to the pre-Phase-B engine.
export function evaluateCostModel(
  model: CostModel, snapshot: PriceSnapshot,
  opts?: { burdenNum?: bigint; L?: bigint },
): RateBreakdown {
  const burdenNum = opts?.burdenNum ?? 0n;
  const lMicro = opts?.L ?? L_MICRO;
  let material = 0n, labor = 0n, equipment = 0n;
  const priceEntryIds: Record<string, string> = {};

  for (const c of model.components) {
    const entry = snapshot[c.priceBookKey];
    if (!entry) throw new MissingPriceKeyError(c.priceBookKey);
    priceEntryIds[c.priceBookKey] = entry.entryId;
    const price = BigInt(entry.priceFils);

    if (c.kind === "labor") {
      // Single fixed-point division (roadmap §7.2): burden and L fold into ONE
      // rounding. cost/unit = (day rate × (1+burden)) ÷ (productivity ÷ L).
      const productivity = parseDecimalToMicro(c.productivityPerDay!);
      labor += roundDivHalfUp(price * (100n + burdenNum) * MICRO * lMicro, productivity * 100n * L_MICRO);
    } else {
      const qty = parseDecimalToMicro(c.qtyPerUnit!);
      const cost = roundDivHalfUp(price * qty, MICRO);
      if (c.kind === "material") material += cost;
      else equipment += cost;
    }
  }

  const waste = roundDivHalfUp(material * parseDecimalToMicro(model.wastePct), 100n * MICRO);
  const base = material + waste + labor + equipment;

  // Overhead/profit precedence: when either is present, compound base×(1+oh)×(1+profit);
  // a legacy markupPct-only model uses the legacy single-markup branch (no firm overhead).
  let final: bigint;
  if (model.overheadPct != null || model.profitPct != null) {
    const oh = parseDecimalToMicro(model.overheadPct ?? "0");
    const pr = parseDecimalToMicro(model.profitPct ?? "0");
    const afterOh = roundDivHalfUp(base * (100n * MICRO + oh), 100n * MICRO);
    final = roundDivHalfUp(afterOh * (100n * MICRO + pr), 100n * MICRO);
  } else {
    final = base + roundDivHalfUp(base * parseDecimalToMicro(model.markupPct), 100n * MICRO);
  }

  return {
    materialFils: Number(material),
    wasteFils: Number(waste),
    laborFils: Number(labor),
    equipmentFils: Number(equipment),
    markupFils: Number(final - base),
    rateFils: Number(final),
    priceEntryIds,
  };
}
