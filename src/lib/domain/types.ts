export type CanonicalUnit =
  | "m3" | "m2" | "lm" | "ton" | "nr" | "ls"
  | "day" | "night" | "pc" | "hr" | "kg" | "pct";

export interface PriceSnapshotEntry {
  priceFils: number;
  entryId: string;
  effectiveDate: string;
  unit: string;
}
export type PriceSnapshot = Record<string, PriceSnapshotEntry>;

export interface RateBreakdown {
  materialFils: number;
  wasteFils: number;
  laborFils: number;
  equipmentFils: number;
  markupFils: number;
  rateFils: number;
  priceEntryIds: Record<string, string>;
}

export type FlagCode =
  | "UNIT_MISMATCH" | "UNIT_UNKNOWN" | "OUT_OF_BAND" | "NO_MATCH"
  | "SEMANTIC_FALLBACK" | "QTY_CHECKSUM_FAIL" | "MISSING_PRICE_KEY"
  | "ROLLUP_MISMATCH" | "RATIO_WARNING" | "NEEDS_MANUAL";

export interface Flag {
  code: FlagCode;
  severity: "error" | "warning";
  messageAr: string;
  detail?: unknown;
}
