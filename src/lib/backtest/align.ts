import type { GoldenLineRow } from "./types";
import { normCode, normDesc, jaccardGe } from "./normalize";

export { normCode, normDesc, jaccardGe };

export interface PricedLineForAlign {
  position: number;
  itemCode?: string;
  descriptionOriginal: string;
  unitCanonical: string | null;
  rateFils: number | null;
  flags: string[];
}

export interface AlignedPair {
  position: number;
  sortOrder: number | null;
}

// Two-pass deterministic alignment (spec §6.1): exact item-code first, then a
// token-set-Jaccard fallback over the remainder. One-to-one.
export function alignLines(priced: PricedLineForAlign[], golden: GoldenLineRow[]): AlignedPair[] {
  const usedGolden = new Set<number>();
  const pairs: AlignedPair[] = [];
  const unmatched: PricedLineForAlign[] = [];

  // Pass 1 — exact code. A blank code never matches.
  for (const p of priced) {
    const pc = normCode(p.itemCode);
    if (pc === "") { unmatched.push(p); continue; }
    const candidates = golden
      .filter((g) => !usedGolden.has(g.sortOrder) && normCode(g.itemCode) !== "" && normCode(g.itemCode) === pc)
      .sort((a, b) =>
        Math.abs(p.position - a.sortOrder) - Math.abs(p.position - b.sortOrder) || a.sortOrder - b.sortOrder,
      );
    if (candidates.length === 0) { unmatched.push(p); continue; }
    usedGolden.add(candidates[0].sortOrder);
    pairs.push({ position: p.position, sortOrder: candidates[0].sortOrder });
  }

  // Pass 2 — description Jaccard >= 0.60, greedy, one-to-one.
  for (const p of unmatched) {
    const candidates = golden
      .filter((g) => !usedGolden.has(g.sortOrder) && jaccardGe(p.descriptionOriginal, g.descriptionOriginal, 60))
      .sort((a, b) => {
        const ua = a.unitCanonical === p.unitCanonical ? 0 : 1;
        const ub = b.unitCanonical === p.unitCanonical ? 0 : 1;
        return (
          ua - ub ||
          Math.abs(p.position - a.sortOrder) - Math.abs(p.position - b.sortOrder) ||
          a.sortOrder - b.sortOrder
        );
      });
    if (candidates.length === 0) { pairs.push({ position: p.position, sortOrder: null }); continue; }
    usedGolden.add(candidates[0].sortOrder);
    pairs.push({ position: p.position, sortOrder: candidates[0].sortOrder });
  }
  return pairs;
}
