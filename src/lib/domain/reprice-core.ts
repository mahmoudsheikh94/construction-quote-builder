import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchedItem } from "./price-quote";
import { priceQuote } from "./price-quote";
import type { SkillContent } from "./skill-schema";
import type { PriceSnapshot, CanonicalUnit } from "./types";
import type { ProjectOverrides } from "./overrides";
import { applyPriceOverrides, applyTimeIndex, applyLocationFactor } from "./overrides";
import type { QuoteConditions, ConditionSeedTables } from "./productivity";

// The inputs a reprice needs — all pre-loaded plain data (no DB in the pure core).
export interface RepriceInput {
  items: MatchedItem[];
  skills: Record<string, { content: SkillContent; versionId: string }>;
  snapshot: PriceSnapshot;
  overrides?: ProjectOverrides;
  costIndices?: Record<string, number>;
  quoteConditions?: QuoteConditions;
  seedTables?: ConditionSeedTables;
}

// Derive labor/material/equipment price-book keys from the skills' components.
function keySets(skills: RepriceInput["skills"]) {
  const labor: string[] = [], material: string[] = [], equipment: string[] = [];
  for (const s of Object.values(skills)) {
    for (const m of s.content.costModels) {
      for (const c of m.components) {
        if (c.kind === "labor") labor.push(c.priceBookKey);
        else if (c.kind === "material") material.push(c.priceBookKey);
        else equipment.push(c.priceBookKey);
      }
    }
  }
  return { labor, material, equipment };
}

export interface RepricedLine { id: string; rateFils: number | null; amountFils: number | null }

// Pure: re-price a quote's already-matched lines with current firm/quote overrides
// and conditions. Applies the snapshot transforms (time index, location) then prices.
// Returns the new rate/amount per line for persistence.
export function repriceCore(input: RepriceInput): RepricedLine[] {
  const { labor, material, equipment } = keySets(input.skills);
  let snapshot = applyPriceOverrides(input.snapshot, input.overrides);
  if (input.costIndices) snapshot = applyTimeIndex(snapshot, input.costIndices, input.overrides);
  snapshot = applyLocationFactor(snapshot, labor, material, equipment, input.overrides);

  const { lines } = priceQuote({
    items: input.items, skills: input.skills, snapshot,
    overrides: input.overrides, quoteConditions: input.quoteConditions, seedTables: input.seedTables,
  });
  return lines.map((l) => ({ id: l.id, rateFils: l.rateFils, amountFils: l.amountFils }));
}

// Reconstruct MatchedItem[] from stored line_items rows (the reprice reuses the DB
// match instead of re-ingesting/re-calling AI).
export function matchedItemsFromRows(rows: Array<Record<string, unknown>>): MatchedItem[] {
  return rows.map((r) => ({
    id: r.id as string,
    sectionRef: (r.section_ref as string) ?? "",
    itemType: (r.item_type as MatchedItem["itemType"]) ?? "unit_rate",
    unitCanonical: (r.unit_canonical as CanonicalUnit | null) ?? null,
    quantityThousandths: r.quantity_thousandths == null ? null : Number(r.quantity_thousandths),
    lineConditions: (r.line_conditions as MatchedItem["lineConditions"]) ?? undefined,
    match: (r.match as MatchedItem["match"]) ?? null,
  }));
}
