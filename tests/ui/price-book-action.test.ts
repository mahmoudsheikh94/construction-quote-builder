import { describe, it, expect } from "vitest";
import { upsertPriceEntryCore } from "@/app/(app)/price-book/actions";
import { getSnapshot } from "@/lib/db/price-book";

describe("upsertPriceEntry", () => {
  it("adds a dated entry that shows in the snapshot as JD→fils", async () => {
    const key = `pb_ui_${Date.now()}`;
    await upsertPriceEntryCore({ key, labelAr: "اختبار", unit: "m2", priceJD: "12.500" });
    const snap = await getSnapshot();
    expect(snap[key].priceFils).toBe(12500);
  });
});
