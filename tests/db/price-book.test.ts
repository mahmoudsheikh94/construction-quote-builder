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

  it("orders by effective_date as the PRIMARY key, not insertion order", async () => {
    // Regression guard: getSnapshot must pick the entry with the latest
    // effective_date, even when that entry was inserted FIRST (older created_at).
    // Insert the newer-effective-date row first so its created_at is older;
    // if effective_date weren't the primary sort, the later-inserted older-date
    // row would wrongly win.
    const key = `rebar_ton_${Date.now()}`;
    await addPriceEntry({ key, labelAr: "حديد تسليح", unit: "ton", priceFils: 520_000, effectiveDate: "2026-06-01" });
    await addPriceEntry({ key, labelAr: "حديد تسليح", unit: "ton", priceFils: 480_000, effectiveDate: "2026-01-01" });

    const snap = await getSnapshot("2026-12-31");
    expect(snap[key].priceFils).toBe(520_000); // June entry wins despite older created_at
  });
});
