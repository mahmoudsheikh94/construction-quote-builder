export type CanonicalUnit =
  | "m3" | "m2" | "lm" | "ton" | "nr" | "ls"
  | "day" | "night" | "pc" | "hr" | "kg" | "pct";

// The structural type of a BOQ line item. Canonical home for this union —
// consumed by the quotes repository, the priceQuote orchestrator, and (in
// Phase 2) ingestion. Keep it here so there is one source of truth.
export type ItemType =
  | "unit_rate" | "provisional_sum" | "dayworks" | "lump_sum" | "percentage";

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
  | "ROLLUP_MISMATCH" | "RATIO_WARNING" | "NEEDS_MANUAL"
  // Reserved for Phase 2: raised when a price-book entry's unit does not match
  // the unit a cost-model component assumes (e.g. an hourly rate where the
  // model expects a day rate), which would otherwise mis-price silently.
  | "PRICE_UNIT_MISMATCH";

export interface Flag {
  code: FlagCode;
  severity: "error" | "warning";
  messageAr: string;
  detail?: unknown;
}
