import { describe, it, expect } from "vitest";
import { toPricedRows } from "@/lib/export/priced-boq";
import type { RawLine } from "@/lib/ingest/types";
import type { PricedLine } from "@/lib/domain/price-quote";

describe("toPricedRows", () => {
  it("joins raw lines with priced results, formatting fils as JD strings", () => {
    const raw: RawLine[] = [{ sortOrder: 0, itemCode: "5/4", sectionRef: "5", descriptionOriginal: "بلاط", unitRaw: "م2", quantityRaw: "2700" }];
    const priced: PricedLine[] = [{ id: "5/4", rateFils: 13_388, amountFils: 36_147_600, breakdown: null, flags: [], provenance: {} }];
    const rows = toPricedRows(raw, priced);
    expect(rows[0]).toMatchObject({ itemCode: "5/4", description: "بلاط", unit: "م2", quantity: "2700", rateJD: "13.388", amountJD: "36147.600", flags: [] });
  });
  it("shows null rate/amount for unpriced/flagged lines", () => {
    const raw: RawLine[] = [{ sortOrder: 0, itemCode: "9/1", sectionRef: "9", descriptionOriginal: "بند غريب" }];
    const priced: PricedLine[] = [{ id: "9/1", rateFils: null, amountFils: null, breakdown: null, flags: [{ code: "NO_MATCH", severity: "error", messageAr: "لا مطابقة" }], provenance: {} }];
    const rows = toPricedRows(raw, priced);
    expect(rows[0].rateJD).toBeNull();
    expect(rows[0].flags).toContain("NO_MATCH");
  });
});
