import { describe, it, expect } from "vitest";
import { saveQuote, listQuotes, getQuote } from "@/lib/db/quotes";
import { logCorrection } from "@/lib/db/corrections";

describe("quote persistence for UI", () => {
  it("saves a priced quote and reads it back in the list + detail", async () => {
    const name = `AlSafi test ${Date.now()}`;
    const { quoteId } = await saveQuote({
      name,
      rows: [
        { sortOrder: 0, itemCode: "1/1", sectionRef: "1", description: "بلاط", unitRaw: "م2", unitCanonical: "m2", quantityThousandths: 2_700_000, itemType: "unit_rate", rateFils: 13_388, amountFils: 36_147_600, flags: [] },
        { sortOrder: 1, itemCode: "1/2", sectionRef: "1", description: "بند غريب", unitRaw: undefined, unitCanonical: null, quantityThousandths: null, itemType: "unit_rate", rateFils: null, amountFils: null, flags: ["NO_MATCH"] },
      ],
    });
    expect(quoteId).toBeTruthy();

    const list = await listQuotes();
    const mine = list.find((q) => q.id === quoteId)!;
    expect(mine.name).toBe(name);
    expect(mine.grandTotalFils).toBe(36_147_600); // only the priced line
    expect(mine.flaggedCount).toBe(1);

    const detail = await getQuote(quoteId);
    expect(detail.lines).toHaveLength(2);
    expect(detail.lines[0].amount_fils).toBe(36_147_600);

    // correction log
    await logCorrection({ lineItemId: detail.lines[1].id, beforeFils: null, afterFils: 5000, scope: "quote" });
  });
});
