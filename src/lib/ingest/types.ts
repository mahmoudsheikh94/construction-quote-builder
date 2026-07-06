export interface RawLine {
  sortOrder: number;
  itemCode?: string;
  sectionRef: string;
  descriptionOriginal: string;
  unitRaw?: string;
  quantityRaw?: string;
  quantityWords?: string;
}
export interface ExtractionResult { lines: RawLine[]; warnings: string[]; }

// Priced variant: used only by the backtest golden-set builder (readPrices).
// Normal ingestion never sets these — the pipeline must not see truth prices.
export interface PricedRawLine extends RawLine {
  truthRateFils?: number | null;
  truthAmountFils?: number | null;
}
export interface PricedExtractionResult { lines: PricedRawLine[]; warnings: string[]; }
