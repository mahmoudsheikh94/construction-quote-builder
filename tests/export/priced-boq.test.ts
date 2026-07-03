import { describe, it, expect } from "vitest";
import { toPricedRows } from "@/lib/export/priced-boq";
import type { RawLine } from "@/lib/ingest/types";
import type { PricedLine } from "@/lib/domain/price-quote";

describe("toPricedRows", () => {
  it("joins raw lines with priced results, formatting fils as JD strings", () => {
    const raw: RawLine[] = [{ sortOrder: 0, itemCode: "5/4", sectionRef: "5", descriptionOriginal: "بلاط", unitRaw: "م2", quantityRaw: "2700" }];
    const priced: PricedLine[] = [{ id: "5/4-0", rateFils: 13_388, amountFils: 36_147_600, breakdown: null, flags: [], provenance: {} }];
    const rows = toPricedRows(raw, priced);
    expect(rows[0]).toMatchObject({ itemCode: "5/4", description: "بلاط", unit: "م2", quantity: "2700", rateJD: "13.388", amountJD: "36147.600", flags: [] });
  });
  it("shows null rate/amount for unpriced/flagged lines", () => {
    const raw: RawLine[] = [{ sortOrder: 0, itemCode: "9/1", sectionRef: "9", descriptionOriginal: "بند غريب" }];
    const priced: PricedLine[] = [{ id: "9/1-0", rateFils: null, amountFils: null, breakdown: null, flags: [{ code: "NO_MATCH", severity: "error", messageAr: "لا مطابقة" }], provenance: {} }];
    const rows = toPricedRows(raw, priced);
    expect(rows[0].rateJD).toBeNull();
    expect(rows[0].flags).toContain("NO_MATCH");
  });

  it("keeps duplicate itemCodes distinct — each row gets its OWN price, not the last one's", () => {
    // Real BOQs have duplicate item codes (e.g. two rows both coded "1/1"). Before the fix,
    // both rows keyed to the same id and the Map in toPricedRows kept only the last one,
    // silently showing row 0 the price that actually belongs to row 1.
    const raw: RawLine[] = [
      { sortOrder: 0, itemCode: "1/1", sectionRef: "1", descriptionOriginal: "بند أول", unitRaw: "م2", quantityRaw: "10" },
      { sortOrder: 1, itemCode: "1/1", sectionRef: "1", descriptionOriginal: "بند ثاني", unitRaw: "م2", quantityRaw: "20" },
    ];
    const priced: PricedLine[] = [
      { id: "1/1-0", rateFils: 1_000, amountFils: 10_000, breakdown: null, flags: [], provenance: {} },
      { id: "1/1-1", rateFils: 2_000, amountFils: 40_000, breakdown: null, flags: [], provenance: {} },
    ];
    const rows = toPricedRows(raw, priced);
    expect(rows[0].itemCode).toBe("1/1");
    expect(rows[0].rateJD).toBe("1.000");
    expect(rows[1].itemCode).toBe("1/1");
    expect(rows[1].rateJD).toBe("2.000");
  });
});
