import { describe, it, expect } from "vitest";
import { applyCorrectionCore } from "@/app/(app)/quotes/[id]/actions";
import { saveQuote, getQuote } from "@/lib/db/quotes";
import { getSnapshot } from "@/lib/db/price-book";

describe("applyCorrection", () => {
  it("scope=quote updates only the line; scope=trade also writes a price-book entry", async () => {
    const { quoteId } = await saveQuote({ name: `c ${Date.now()}`, rows: [
      { sortOrder: 0, itemCode: "1", sectionRef: "1", description: "بلاط", unitRaw: "م2", unitCanonical: "m2", quantityThousandths: 1_000, itemType: "unit_rate", rateFils: 22000, amountFils: 22000, flags: [] },
    ]});
    const q = await getQuote(quoteId);
    const line = q.lines[0];

    // quote-only: line updates, no price-book change
    await applyCorrectionCore({ lineItemId: line.id, newRateJD: "18.000", quantityThousandths: 1_000, scope: "quote" });
    const q2 = await getQuote(quoteId);
    expect(q2.lines[0].rate_fils).toBe(18000);
    expect(q2.lines[0].amount_fils).toBe(18000); // 1 × 18

    // trade scope: also writes a dated price-book entry
    const key = `tile_correction_${Date.now()}`;
    await applyCorrectionCore({ lineItemId: line.id, newRateJD: "16.000", quantityThousandths: 1_000, scope: "trade", priceBookKey: key, unit: "m2", labelAr: "بلاط" });
    const snap = await getSnapshot();
    expect(snap[key].priceFils).toBe(16000);
  });
});
