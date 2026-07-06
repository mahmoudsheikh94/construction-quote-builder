import { describe, it, expect } from "vitest";
import { getFirmSettings } from "@/lib/db/firm-settings";
import { getLocationFactors, getWasteDefaults, getSizeCurves } from "@/lib/db/reference";

describe("firm settings + reference repos", () => {
  it("reads the singleton with seeded defaults", async () => {
    const f = await getFirmSettings();
    expect(f.laborBurdenPct).toBe("30");
    expect(f.overheadPct).toBe("15");
  });

  it("reads seeded reference tables", async () => {
    const loc = await getLocationFactors();
    expect(loc.amman).toEqual({ labor: 1, material: 1 });
    const waste = await getWasteDefaults();
    expect(waste.tile).toBe("10");
    const curves = await getSizeCurves();
    expect(curves.generic.exponent).toBe(0.9);
  });
});
