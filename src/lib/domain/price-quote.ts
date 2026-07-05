import type { ProfileContent, SkillContent } from "./skill-schema";
import type { CanonicalUnit, Flag, ItemType, PriceSnapshot, RateBreakdown } from "./types";
import { evaluateCostModel, MissingPriceKeyError } from "./cost-engine";
import { applyModelOverrides, applyPriceOverrides, applyLaborPremiumToSnapshot, burdenNumFromOverrides, type ProjectOverrides } from "./overrides";
import { buildRollup, type QuoteRollup } from "./rollup";
import { validateBand, validateUnit, checkRatios } from "./validation";
import { lineAmountFils } from "./money";
import { computeLossMultiplier, type QuoteConditions, type LineConditions, type ConditionSeedTables } from "./productivity";

export type { ItemType };

export interface MatchedItem {
  id: string;
  sectionRef: string;
  itemType: ItemType;
  unitCanonical: CanonicalUnit | null;
  quantityThousandths: number | null;
  givenAmountFils?: number;
  lineConditions?: LineConditions;
  match: { trade: string; costModelId: string; method: "deterministic" | "semantic"; confidence: number } | null;
}

export interface PricedLine {
  id: string;
  rateFils: number | null;
  amountFils: number | null;
  breakdown: RateBreakdown | null;
  flags: Flag[];
  provenance: { skillVersionId?: string; method?: string; priceEntryIds?: Record<string, string> };
}

export function priceQuote(input: {
  items: MatchedItem[];
  skills: Record<string, { content: SkillContent; versionId: string }>;
  snapshot: PriceSnapshot;
  overrides?: ProjectOverrides;
  ratioChecks?: ProfileContent["ratioChecks"];
  quoteConditions?: QuoteConditions;
  seedTables?: ConditionSeedTables;
}): { lines: PricedLine[]; rollup: QuoteRollup; projectFlags: Flag[] } {
  const burdenNum = burdenNumFromOverrides(input.overrides);
  const laborKeys = Object.values(input.skills).flatMap((s) =>
    s.content.costModels.flatMap((m) =>
      m.components.filter((c) => c.kind === "labor").map((c) => c.priceBookKey),
    ),
  );
  const snapshot = applyLaborPremiumToSnapshot(
    applyPriceOverrides(input.snapshot, input.overrides),
    laborKeys,
    input.overrides,
  );

  const lines = input.items.map((item): PricedLine => {
    // Non-unit-rate item types never reach rate matching.
    if (item.itemType !== "unit_rate") {
      if ((item.itemType === "provisional_sum" || item.itemType === "lump_sum") && item.givenAmountFils !== undefined) {
        return {
          id: item.id, rateFils: null, amountFils: item.givenAmountFils,
          breakdown: null, flags: [], provenance: { method: "given" },
        };
      }
      return unpriced(item, [{
        code: "NEEDS_MANUAL", severity: "error",
        messageAr: "هذا البند يتطلب تسعيراً يدوياً من المهندس",
        detail: { itemType: item.itemType },
      }]);
    }

    if (!item.match) {
      return unpriced(item, [{ code: "NO_MATCH", severity: "error", messageAr: "لم يتم العثور على نموذج تسعير مطابق" }]);
    }

    const skill = input.skills[item.match.trade];
    const baseModel = skill?.content.costModels.find((m) => m.id === item.match!.costModelId);
    if (!skill || !baseModel) {
      return unpriced(item, [{
        code: "NO_MATCH", severity: "error",
        messageAr: "نموذج التسعير المُطابق غير موجود في المهارة",
        detail: item.match,
      }]);
    }

    const unitFlags = validateUnit(item.unitCanonical, baseModel.unit);
    if (unitFlags.length > 0) return unpriced(item, unitFlags);

    const model = applyModelOverrides(baseModel, item.match.trade, input.overrides);

    let breakdown: RateBreakdown;
    try {
      const loss = input.quoteConditions && input.seedTables
        ? computeLossMultiplier(input.quoteConditions, item.lineConditions ?? null, input.seedTables)
        : null;
      breakdown = evaluateCostModel(model, snapshot, { burdenNum, L: loss?.lMicro ?? 1_000_000n });
      if (loss) {
        breakdown.productivityLoss = loss.breakdown.productivityLoss;
        breakdown.sources = loss.breakdown.sources;
      }
    } catch (e) {
      if (e instanceof MissingPriceKeyError) {
        return unpriced(item, [{
          code: "MISSING_PRICE_KEY", severity: "error",
          messageAr: e.message, detail: { key: e.key },
        }]);
      }
      throw e;
    }

    const flags: Flag[] = [
      ...validateBand(breakdown.rateFils, model.band),
      ...(item.match.method === "semantic"
        ? [{
            code: "SEMANTIC_FALLBACK" as const, severity: "warning" as const,
            messageAr: "تمت المطابقة دلالياً — يُنصح بمراجعة المهندس",
            detail: { confidence: item.match.confidence },
          }]
        : []),
    ];

    const amountFils = item.quantityThousandths === null
      ? null
      : lineAmountFils(item.quantityThousandths, breakdown.rateFils);

    return {
      id: item.id,
      rateFils: breakdown.rateFils,
      amountFils,
      breakdown,
      flags,
      provenance: {
        skillVersionId: skill.versionId,
        method: item.match.method,
        priceEntryIds: breakdown.priceEntryIds,
      },
    };
  });

  const rollup = buildRollup(
    input.items.map((item, i) => ({ sectionRef: item.sectionRef, amountFils: lines[i].amountFils })),
  );
  const projectFlags = checkRatios(rollup, input.ratioChecks ?? []);

  return { lines, rollup, projectFlags };
}

function unpriced(item: MatchedItem, flags: Flag[]): PricedLine {
  return { id: item.id, rateFils: null, amountFils: null, breakdown: null, flags, provenance: {} };
}
