import { describe, it, expect } from "vitest";
import { applyEstimateBand } from "@/lib/domain/estimate-band";

describe("applyEstimateBand", () => {
  it("class 1 gives -10/+15% band", () => {
    const b = applyEstimateBand(100000, 1);
    expect(b.point).toBe(100000);
    expect(b.low).toBe(90000); // -10%
    expect(b.high).toBe(115000); // +15%
    expect(b.class).toBe(1);
  });
  it("class 5 gives -50/+100% band", () => {
    const b = applyEstimateBand(100000, 5);
    expect(b.low).toBe(50000);
    expect(b.high).toBe(200000);
  });
  it("null class yields no band", () => {
    expect(applyEstimateBand(100000, null)).toEqual({ point: 100000, low: null, high: null, class: null });
  });
  it("an out-of-range class yields no band", () => {
    expect(applyEstimateBand(100000, 9).low).toBeNull();
  });
});
