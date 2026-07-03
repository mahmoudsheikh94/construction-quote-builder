import type { RawLine } from "@/lib/ingest/types";
import type { CanonicalUnit, Flag, ItemType, PriceSnapshot } from "@/lib/domain/types";
import type { SkillContent } from "@/lib/domain/skill-schema";
import { normalizeUnit, parseQuantityToThousandths } from "@/lib/domain/normalize";
import { priceQuote, type MatchedItem, type PricedLine } from "@/lib/domain/price-quote";
import type { MatchResult } from "./match";
import type { QuoteRollup } from "@/lib/domain/rollup";

export function toMatchedItem(line: RawLine, itemType: ItemType, match: MatchResult | null): MatchedItem {
  let unitCanonical: CanonicalUnit | null = null;
  if (line.unitRaw) unitCanonical = normalizeUnit(line.unitRaw);
  let quantityThousandths: number | null = null;
  if (line.quantityRaw) {
    try {
      quantityThousandths = parseQuantityToThousandths(line.quantityRaw);
    } catch {
      quantityThousandths = null;
    }
  }
  return {
    id: `${line.itemCode ?? "row"}-${line.sortOrder}`,
    sectionRef: line.sectionRef,
    itemType,
    unitCanonical,
    quantityThousandths,
    match: match ? { trade: match.trade, costModelId: match.costModelId, method: match.method, confidence: match.confidence } : null,
  };
}

// labor components must be priced per day/night/hr (a time rate); material/equipment
// components are not checked here — they follow the model's own output unit.
export function priceUnitMismatchFlags(
  items: MatchedItem[],
  skills: Record<string, { content: SkillContent; versionId: string }>,
  snapshot: PriceSnapshot,
): Flag[] {
  const flags: Flag[] = [];
  for (const item of items) {
    if (item.itemType !== "unit_rate" || !item.match) continue;
    const model = skills[item.match.trade]?.content.costModels.find((m) => m.id === item.match!.costModelId);
    if (!model) continue;
    for (const c of model.components) {
      if (c.kind !== "labor") continue;
      const entry = snapshot[c.priceBookKey];
      if (!entry) continue;
      const ok = entry.unit === "day" || entry.unit === "night" || entry.unit === "hr";
      if (!ok) {
        flags.push({
          code: "PRICE_UNIT_MISMATCH",
          severity: "warning",
          messageAr: `وحدة سعر «${c.labelAr}» (${entry.unit}) لا تناسب مكوّن العمالة — يُتوقع سعر يومي/ساعي`,
          detail: { itemId: item.id, component: c.id, priceUnit: entry.unit },
        });
      }
    }
  }
  return flags;
}

export function assembleAndPrice(input: {
  items: MatchedItem[];
  skills: Record<string, { content: SkillContent; versionId: string }>;
  snapshot: PriceSnapshot;
}): { lines: PricedLine[]; rollup: QuoteRollup; projectFlags: Flag[] } {
  const result = priceQuote({ items: input.items, skills: input.skills, snapshot: input.snapshot });
  const extra = priceUnitMismatchFlags(input.items, input.skills, input.snapshot);
  // attach each price-unit flag to its line
  for (const f of extra) {
    const itemId = (f.detail as { itemId: string }).itemId;
    const line = result.lines.find((l) => l.id === itemId);
    if (line) line.flags.push(f);
  }
  return result;
}
