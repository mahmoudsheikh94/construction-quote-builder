import { describe, it, expect } from "vitest";
import { repriceCore } from "@/lib/domain/reprice-core";
import type { PriceSnapshot } from "@/lib/domain/types";
import type { MatchedItem } from "@/lib/domain/price-quote";

// A line whose matched trade has no loaded skill must reprice to rateFils=null
// (NO_MATCH) — the caller then PRESERVES the stored rate rather than overwriting it.
describe("repriceCore data-safety", () => {
  it("returns null rate for a line whose skill is missing (caller must preserve)", () => {
    const items: MatchedItem[] = [{
      id: "i1", sectionRef: "1", itemType: "unit_rate", unitCanonical: "m2", quantityThousandths: 1_000_000,
      match: { trade: "ghost_trade", costModelId: "x", method: "deterministic", confidence: 1 },
    }];
    const snapshot: PriceSnapshot = {};
    const out = repriceCore({ items, skills: {}, snapshot }); // no skills loaded
    expect(out[0].rateFils).toBeNull();
  });
});
