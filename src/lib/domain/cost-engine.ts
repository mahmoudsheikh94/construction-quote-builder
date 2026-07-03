import type { CostModel } from "./skill-schema";
import type { PriceSnapshot, RateBreakdown } from "./types";
import { parseDecimalToMicro, roundDivHalfUp } from "./money";

export class MissingPriceKeyError extends Error {
  constructor(public key: string) {
    super(`مفتاح سعر مفقود في دفتر الأسعار: ${key}`);
  }
}

const MICRO = 1_000_000n;

export function evaluateCostModel(model: CostModel, snapshot: PriceSnapshot): RateBreakdown {
  let material = 0n, labor = 0n, equipment = 0n;
  const priceEntryIds: Record<string, string> = {};

  for (const c of model.components) {
    const entry = snapshot[c.priceBookKey];
    if (!entry) throw new MissingPriceKeyError(c.priceBookKey);
    priceEntryIds[c.priceBookKey] = entry.entryId;
    const price = BigInt(entry.priceFils);

    if (c.kind === "labor") {
      // cost per output unit = day rate ÷ productivity(units/day)
      const productivity = parseDecimalToMicro(c.productivityPerDay!);
      labor += roundDivHalfUp(price * MICRO, productivity);
    } else {
      const qty = parseDecimalToMicro(c.qtyPerUnit!);
      const cost = roundDivHalfUp(price * qty, MICRO);
      if (c.kind === "material") material += cost;
      else equipment += cost;
    }
  }

  const waste = roundDivHalfUp(material * parseDecimalToMicro(model.wastePct), 100n * MICRO);
  const base = material + waste + labor + equipment;
  const markup = roundDivHalfUp(base * parseDecimalToMicro(model.markupPct), 100n * MICRO);

  return {
    materialFils: Number(material),
    wasteFils: Number(waste),
    laborFils: Number(labor),
    equipmentFils: Number(equipment),
    markupFils: Number(markup),
    rateFils: Number(base + markup),
    priceEntryIds,
  };
}
