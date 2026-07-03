import { describe, it, expect } from "vitest";
import { addPriceEntry, getSnapshot, getHistory } from "@/lib/db/price-book";

describe("price book", () => {
  it("returns the latest effective price per key, respecting asOf", async () => {
    const key = `cement_bag_50kg_${Date.now()}`; // unique per test run
    await addPriceEntry({ key, labelAr: "كيس إسمنت ٥٠ كغم", unit: "pc", priceFils: 4_200, effectiveDate: "2026-01-01" });
    await addPriceEntry({ key, labelAr: "كيس إسمنت ٥٠ كغم", unit: "pc", priceFils: 4_500, effectiveDate: "2026-06-01" });

    const now = await getSnapshot("2026-07-01");
    expect(now[key].priceFils).toBe(4_500);

    const before = await getSnapshot("2026-03-01");
    expect(before[key].priceFils).toBe(4_200);

    const history = await getHistory(key);
    expect(history).toHaveLength(2);
    expect(history[0].priceFils).toBe(4_500); // newest first
  });
});
