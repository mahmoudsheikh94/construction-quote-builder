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
