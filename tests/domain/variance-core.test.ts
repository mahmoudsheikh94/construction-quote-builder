import { describe, it, expect } from "vitest";
import { runVarianceCore } from "@/lib/domain/variance-core";
import type { DayLogEntry } from "@/lib/db/day-log";
import type { LearnedNorm } from "@/lib/db/learned-norms";

function row(over: Partial<DayLogEntry>): DayLogEntry {
  return {
    id: "x", projectId: null, laborRateId: null, trade: "tiling", task: null,
    costModelId: "m1", componentId: "c2", date: "2026-01-01",
    crewSkilled: 1, crewHelpers: 0, hoursWorked: 8, quantityInstalled: 10, unitCanonical: "m2", reworkQuantity: 0,
    ...over,
  };
}

describe("runVarianceCore", () => {
  it("computes achieved productivity per crew-day, excluding rework", () => {
    // 1 worker * 8h/8 = 1 crew-day ; (12 installed - 2 rework) = 10 net -> 10 units/day
    const out = runVarianceCore([row({ quantityInstalled: 12, reworkQuantity: 2 })], new Map());
    const n = out.get("productivity tiling:m1:c2");
    expect(n?.value).toBe(10);
    expect(n?.sampleSize).toBe(1);
  });

  it("EWMA-updates an existing norm toward the new actual", () => {
    const existing = new Map<string, LearnedNorm>([
      ["productivity tiling:m1:c2", { scope: "productivity", key: "tiling:m1:c2", value: 10, sampleSize: 1 }],
    ]);
    // new day: 12 units/crew-day -> EWMA 0.7*10 + 0.3*12 = 10.6
    const out = runVarianceCore([row({ quantityInstalled: 12 })], existing);
    const n = out.get("productivity tiling:m1:c2");
    expect(n?.value).toBe(10.6);
    expect(n?.sampleSize).toBe(2);
  });

  it("skips rows without resolved cost_model_id/component_id", () => {
    const out = runVarianceCore([row({ costModelId: null })], new Map());
    expect(out.size).toBe(0);
  });
});
