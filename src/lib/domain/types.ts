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
