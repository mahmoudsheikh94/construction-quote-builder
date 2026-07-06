import type { AIAdapter } from "@/lib/ai/adapter";
import { ingestExcel } from "@/lib/ingest/excel";
import { ingestPdf } from "@/lib/ingest/pdf";
import { classifyItemType } from "@/lib/ingest/item-type-gate";
import { chunk, mapLimit, batchTagLines, batchMatchLines } from "./batch";
import { toMatchedItem, assembleAndPrice } from "./assemble";
import type { MatchResult } from "./match";
import { getActiveProfile, getActiveSkill, getSkillVersionById, getProfileVersionById } from "@/lib/db/skills";
import { getSnapshot } from "@/lib/db/price-book";
import { lookupBySignature, type LineTags } from "@/lib/db/corpus";
import type { SkillContent } from "@/lib/domain/skill-schema";
import type { MatchedItem } from "@/lib/domain/price-quote";
import { toPricedRows, toPricedJson, type PricedRow } from "@/lib/export/priced-boq";
import type { RawLine } from "@/lib/ingest/types";
import type { QuoteRollup } from "@/lib/domain/rollup";
import type { Flag } from "@/lib/domain/types";
import type { ProjectOverrides } from "@/lib/domain/overrides";

export async function runPipeline(input: {
  file: string;
  profileSlug: string;
  adapter: AIAdapter;
  asOf?: string;
  batchSize?: number;
  concurrency?: number;
  // Backtest config-pin (defaults preserve current behaviour): pin the profile
  // version, per-trade skill versions, and/or apply project overrides.
  overrides?: ProjectOverrides;
  skillVersions?: Record<string, string>; // trade slug -> skill_version id
  profileVersionId?: string;
}): Promise<{ json: object; rows: PricedRow[]; rollup: QuoteRollup; projectFlags: Flag[]; ingestionWarnings: string[] }> {
  // 1. Ingest
  const isExcel = /\.xlsx?$|\.xlsm$/i.test(input.file);
  const extraction = isExcel ? ingestExcel(input.file) : await ingestPdf(input.file, input.adapter);
  const rawLines: RawLine[] = extraction.lines;

  // 2. Load the profile + its skills (pinned versions if provided) + a price snapshot
  const profile = input.profileVersionId
    ? await getProfileVersionById(input.profileVersionId)
    : await getActiveProfile(input.profileSlug);
  if (!profile) throw new Error(`ملف المشروع «${input.profileSlug}» غير مفعّل`);
  const skills: Record<string, { content: SkillContent; versionId: string }> = {};
  for (const tradeSlug of profile.content.trades) {
    const pinned = input.skillVersions?.[tradeSlug];
    const s = pinned ? await getSkillVersionById(pinned) : await getActiveSkill(tradeSlug);
    if (s) skills[s.content.trade] = { content: s.content, versionId: s.versionId };
  }
  const snapshot = await getSnapshot(input.asOf);

  // 3. Classify + batch-tag + corpus-first + batch-match, all concurrent.
  const tradeSlugs = Object.keys(skills);
  const batchSize = input.batchSize ?? 25;
  const concurrency = input.concurrency ?? 5;

  // 3a. Classify all lines (sync, no AI). Non-unit-rate lines get match=null immediately.
  const classified = rawLines.map((line) => ({ line, itemType: classifyItemType(line).itemType }));
  const unitRate = classified.filter((c) => c.itemType === "unit_rate");

  // 3b. Batch-tag all unit-rate lines (chunked, concurrent) against the first trade —
  //     tags describe the line, not the trade, so tagging is trade-independent.
  //     A throw degrades that CHUNK to empty tags; it never aborts the run.
  const tagChunks = chunk(unitRate.map((c) => c.line), batchSize || 1);
  const firstTrade = tradeSlugs[0];
  const taggedChunks =
    tradeSlugs.length > 0 && unitRate.length > 0
      ? await mapLimit(tagChunks, concurrency, async (lines) => {
          try {
            return await batchTagLines(input.adapter, firstTrade, lines);
          } catch {
            return lines.map(() => ({}) as LineTags); // degrade whole chunk to empty tags
          }
        })
      : tagChunks.map((lines) => lines.map(() => ({}) as LineTags));
  const tags: LineTags[] = taggedChunks.flat(); // aligned to unitRate order

  // 3c. Corpus-first: a line whose (trade, signature) already resolves needs no AI match.
  //     Collect the misses into needMatch for batch-matching.
  const matchByLineIndex = new Map<number, MatchResult | null>(); // key = index into unitRate
  const needMatch: Array<{ uIdx: number; rawText: string; tags: LineTags }> = [];
  for (let i = 0; i < unitRate.length; i++) {
    const t = tags[i];
    let hit: MatchResult | null = null;
    for (const trade of tradeSlugs) {
      const found = await lookupBySignature(trade, t);
      if (found) {
        hit = { trade, costModelId: found.costModelId, method: "deterministic", confidence: 1 };
        break;
      }
    }
    if (hit) matchByLineIndex.set(i, hit);
    else needMatch.push({ uIdx: i, rawText: unitRate[i].line.descriptionOriginal, tags: t });
  }

  // 3d. Batch-match the remaining lines against each trade until matched.
  //     A throw degrades that CHUNK to nulls (never aborts). Once a line is matched,
  //     it's skipped on subsequent trades.
  for (const trade of tradeSlugs) {
    const still = needMatch.filter((n) => !matchByLineIndex.get(n.uIdx));
    if (still.length === 0) break;
    const mChunks = chunk(still, batchSize || 1);
    const resultsPerChunk = await mapLimit(mChunks, concurrency, async (group) => {
      try {
        return await batchMatchLines(
          input.adapter,
          trade,
          skills[trade].content,
          group.map((g) => ({ rawText: g.rawText, tags: g.tags })),
        );
      } catch {
        return group.map(() => null); // degrade whole chunk, never abort
      }
    });
    const flat = resultsPerChunk.flat();
    still.forEach((n, i) => {
      if (flat[i]) matchByLineIndex.set(n.uIdx, flat[i]);
    });
  }

  // 3e. Assemble MatchedItems in ORIGINAL rawLines order (pricing + rollup depend on it).
  const uPos = new Map<RawLine, number>();
  unitRate.forEach((c, i) => uPos.set(c.line, i));
  const items: MatchedItem[] = classified.map(({ line, itemType }) => {
    const i = uPos.get(line);
    const match = itemType === "unit_rate" && i !== undefined ? (matchByLineIndex.get(i) ?? null) : null;
    return toMatchedItem(line, itemType, match);
  });

  // 4. Price + flag
  const result = assembleAndPrice({ items, skills, snapshot, overrides: input.overrides });
  const rows = toPricedRows(rawLines, result.lines);
  const json = toPricedJson(rows, result.rollup, result.projectFlags, extraction.warnings);
  return { json, rows, rollup: result.rollup, projectFlags: result.projectFlags, ingestionWarnings: extraction.warnings };
}
