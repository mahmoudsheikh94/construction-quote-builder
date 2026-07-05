import { describe, it, expect } from "vitest";
import { getConditionSeedTables } from "@/lib/db/conditions";

describe("getConditionSeedTables", () => {
  it("loads all seed tables (30 NECA rows, MCAA table, bands)", async () => {
    const s = await getConditionSeedTables();
    expect(s.neca.length).toBe(30);
    expect(s.mcaa.logistics.average).toBe(25);
    expect(s.shiftBands.third).toBe(18);
    expect(s.heightBands.find((b) => b.minFt === 10)?.upliftPct).toBe(25);
    expect(s.floorBands.find((b) => b.minFloors === 20)?.upliftPct).toBe(13);
  });
});
