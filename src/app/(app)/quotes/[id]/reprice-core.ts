// Server-side reprice: reload a quote's matched lines + firm/quote overrides +
// conditions, re-price them, and persist the new rates. Session-client by default;
// tests can inject a service client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getQuote } from "@/lib/db/quotes";
import { getActiveSkill } from "@/lib/db/skills";
import { getSnapshot } from "@/lib/db/price-book";
import { getFirmSettings } from "@/lib/db/firm-settings";
import { getCostIndices } from "@/lib/db/reference";
import { getConditionSeedTables } from "@/lib/db/conditions";
import { buildProjectOverrides } from "@/lib/domain/build-overrides";
import { repriceCore, matchedItemsFromRows } from "@/lib/domain/reprice-core";
import type { SkillContent } from "@/lib/domain/skill-schema";
import type { QuoteConditions } from "@/lib/domain/productivity";
import type { ProjectOverrides } from "@/lib/domain/overrides";

export async function repriceQuoteCore(quoteId: string, db?: SupabaseClient): Promise<void> {
  const sc = db ?? (await createClient());
  const quote = await getQuote(quoteId, sc);

  const rows = quote.lines as unknown as Array<Record<string, unknown>>;
  const items = matchedItemsFromRows(rows);

  // Load the skills referenced by the matched lines.
  const tradeSlugs = [...new Set(items.map((i) => i.match?.trade).filter(Boolean) as string[])];
  const skills: Record<string, { content: SkillContent; versionId: string }> = {};
  for (const slug of tradeSlugs) {
    const s = await getActiveSkill(slug, sc).catch(() => null);
    if (s) skills[s.content.trade] = { content: s.content, versionId: s.versionId };
  }

  const targetDate = quote.settings.targetDate ?? undefined;
  const snapshot = await getSnapshot(targetDate, sc);
  const firm = await getFirmSettings(sc);
  const costIndices = await getCostIndices(sc);

  const overrides: ProjectOverrides = buildProjectOverrides({
    firm,
    quoteOverrides: (quote.settings.overrides as Partial<ProjectOverrides>) ?? {},
  });

  // Conditions (Phase C) if the quote carries them.
  let quoteConditions: QuoteConditions | undefined;
  let seedTables;
  const ci = (quote.settings.overrides as Record<string, unknown> | null)?.conditionInput;
  if (ci) {
    quoteConditions = ci as QuoteConditions;
    seedTables = await getConditionSeedTables(sc);
  }

  const repriced = repriceCore({ items, skills, snapshot, overrides, costIndices, quoteConditions, seedTables });

  // Data safety: only overwrite a line whose reprice actually produced a rate.
  // A line the reprice can't price (missing skill/price key) keeps its stored rate —
  // never destroy a good number with a null.
  for (const line of repriced) {
    if (line.rateFils == null) continue;
    await sc.from("line_items").update({ rate_fils: line.rateFils, amount_fils: line.amountFils }).eq("id", line.id);
  }
}
