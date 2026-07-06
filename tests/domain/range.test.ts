import { describe, it, expect } from "vitest";
import { applyOptimismUplift } from "@/lib/domain/optimism";
import { buildQuoteRange } from "@/lib/domain/range";

describe("applyOptimismUplift", () => {
  it("uplifts the point by the given percent, or identity when null", () => {
    expect(applyOptimismUplift(100000, 24)).toBe(124000);
    expect(applyOptimismUplift(100000, null)).toBe(100000);
  });
});

describe("buildQuoteRange", () => {
  it("anchors band + P80 to the post-uplift point", () => {
    const r = buildQuoteRange({ grandTotalFils: 100000, estimateClass: 1, optimismPct: 24, contingencyPct: 10 });
    expect(r.point).toBe(124000);
    expect(r.p50).toBe(124000); // == pt
    expect(r.p80).toBe(136400); // pt * 1.10
    expect(r.low).toBe(111600); // class-1 -10% around pt
    expect(r.high).toBe(142600); // class-1 +15% around pt
  });
  it("null class -> no band; contingency set -> P80 still emits", () => {
    const r = buildQuoteRange({ grandTotalFils: 100000, estimateClass: null, optimismPct: null, contingencyPct: 10 });
    expect(r.low).toBeNull();
    expect(r.p80).toBe(110000);
  });
});
