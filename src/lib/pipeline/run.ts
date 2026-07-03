import type { AIAdapter } from "@/lib/ai/adapter";
import { ingestExcel } from "@/lib/ingest/excel";
import { ingestPdf } from "@/lib/ingest/pdf";
import { classifyItemType } from "@/lib/ingest/item-type-gate";
import { tagLine } from "./tag";
import { matchLine } from "./match";
import { toMatchedItem, assembleAndPrice } from "./assemble";
import { getActiveProfile, getActiveSkill } from "@/lib/db/skills";
import { getSnapshot } from "@/lib/db/price-book";
import type { SkillContent } from "@/lib/domain/skill-schema";
import type { MatchedItem } from "@/lib/domain/price-quote";
import { toPricedRows, toPricedJson, type PricedRow } from "@/lib/export/priced-boq";
import type { RawLine } from "@/lib/ingest/types";
import type { QuoteRollup } from "@/lib/domain/rollup";
import type { Flag } from "@/lib/domain/types";

export async function runPipeline(input: {
  file: string;
  profileSlug: string;
  adapter: AIAdapter;
  asOf?: string;
}): Promise<{ json: object; rows: PricedRow[]; rollup: QuoteRollup; projectFlags: Flag[]; ingestionWarnings: string[] }> {
  // 1. Ingest
  const isExcel = /\.xlsx?$|\.xlsm$/i.test(input.file);
  const extraction = isExcel ? ingestExcel(input.file) : await ingestPdf(input.file, input.adapter);
  const rawLines: RawLine[] = extraction.lines;

  // 2. Load the profile + its active skills + a price snapshot
  const profile = await getActiveProfile(input.profileSlug);
  if (!profile) throw new Error(`ملف المشروع «${input.profileSlug}» غير مفعّل`);
  const skills: Record<string, { content: SkillContent; versionId: string }> = {};
  for (const tradeSlug of profile.content.trades) {
    const s = await getActiveSkill(tradeSlug);
    if (s) skills[s.content.trade] = { content: s.content, versionId: s.versionId };
  }
  const snapshot = await getSnapshot(input.asOf);

  // 3. Per line: classify → (unit_rate only) tag + match → MatchedItem
  const tradeSlugs = Object.keys(skills);
  const items: MatchedItem[] = [];
  for (const line of rawLines) {
    const { itemType } = classifyItemType(line);
    let match = null;
    if (itemType === "unit_rate" && tradeSlugs.length > 0) {
      // Tags describe the LINE, not the trade — tag once (recorded under the first
      // candidate trade), then try each active trade's match against those same tags.
      // (Small trade set per profile.) A failure here (e.g. AISchemaError after retries
      // exhausted) must degrade this single line to NO_MATCH via priceQuote, never abort
      // pricing for the whole run.
      try {
        const tags = await tagLine(input.adapter, tradeSlugs[0], line);
        for (const trade of tradeSlugs) {
          match = await matchLine(input.adapter, trade, tags, skills[trade].content, line.descriptionOriginal);
          if (match) break;
        }
      } catch {
        match = null;
      }
    }
    items.push(toMatchedItem(line, itemType, match));
  }

  // 4. Price + flag
  const result = assembleAndPrice({ items, skills, snapshot });
  const rows = toPricedRows(rawLines, result.lines);
  const json = toPricedJson(rows, result.rollup, result.projectFlags, extraction.warnings);
  return { json, rows, rollup: result.rollup, projectFlags: result.projectFlags, ingestionWarnings: extraction.warnings };
}
