import { describe, it, expect } from "vitest";
import { buildProjectOverrides } from "@/lib/domain/build-overrides";

describe("buildProjectOverrides", () => {
  it("overlays per-quote over firm defaults", () => {
    const firm = { laborBurdenPct: "30", overheadPct: "15", defaultReferenceLocation: "amman" };
    const o = buildProjectOverrides({ firm, quoteOverrides: { profitPct: "8", laborBurdenPct: "35" } });
    expect(o.laborBurdenPct).toBe("35"); // per-quote wins
    expect(o.profitPct).toBe("8");
  });
  it("uses firm defaults when the quote omits", () => {
    const firm = { laborBurdenPct: "30", overheadPct: "15", defaultReferenceLocation: null };
    expect(buildProjectOverrides({ firm }).laborBurdenPct).toBe("30");
  });
  it("passes through quote-only override fields (location, size, target date)", () => {
    const firm = { laborBurdenPct: "30", overheadPct: "15", defaultReferenceLocation: null };
    const o = buildProjectOverrides({
      firm,
      quoteOverrides: { locationFactor: { labor: "1.1" }, sizeFactor: "0.9", targetDate: "2027-01-01" },
    });
    expect(o.locationFactor).toEqual({ labor: "1.1" });
    expect(o.sizeFactor).toBe("0.9");
    expect(o.targetDate).toBe("2027-01-01");
  });
});
