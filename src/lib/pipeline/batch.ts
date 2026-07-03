import { z } from "zod";
import type { AIAdapter } from "@/lib/ai/adapter";
import type { RawLine } from "@/lib/ingest/types";
import { recordTagging, type LineTags } from "@/lib/db/corpus";

export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk: size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Run fn over items with at most `limit` concurrent executions, preserving
// input order in the returned array. A worker pulls the next index until the
// queue drains. If any fn rejects, the returned promise rejects.
export async function mapLimit<T, R>(
  items: T[], limit: number, fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers: Promise<void>[] = [];
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  const n = Math.min(limit, items.length); // 0 workers for empty input; caps at item count
  for (let w = 0; w < n; w++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

export const BATCH_TAGS_SCHEMA = z.object({
  tags: z.array(z.object({
    index: z.number().int().nonnegative(),
    material: z.string().optional(),
    dimensions: z.string().optional(),
    grade: z.string().optional(),
    category: z.string().optional(),
    standardRefs: z.array(z.string()).optional(),
  })),
});

const BATCH_TAG_SYSTEM = `أنت تصنّف بنود جداول الكميات الإنشائية دفعةً واحدة. لكل بند استخرج سمات منظمة:
material، dimensions، grade، category، standardRefs. لا تُسعّر. أعِد JSON فقط بالشكل {"tags":[{"index":<رقم البند>, ...}]} مع الحفاظ على نفس الفهرس المعطى لكل بند.`;

export async function batchTagLines(adapter: AIAdapter, trade: string, lines: RawLine[]): Promise<LineTags[]> {
  if (lines.length === 0) return [];
  const numbered = lines.map((l, i) => `${i}. «${l.descriptionOriginal}» [${l.unitRaw ?? "?"}]`).join("\n");
  const res = await adapter.run<z.infer<typeof BATCH_TAGS_SCHEMA>>({
    system: BATCH_TAG_SYSTEM,
    prompt: `صنّف البنود التالية وأعِد سمات كل واحد بفهرسه:\n${numbered}`,
    schema: BATCH_TAGS_SCHEMA,
  });

  const out: LineTags[] = lines.map(() => ({}));
  for (const t of res.tags) {
    if (t.index < 0 || t.index >= lines.length) continue; // ignore out-of-range indices
    const { index, ...tags } = t;
    out[index] = tags;
  }
  // Persist every line's tags (empty ones too are harmless; skip persisting empties).
  for (let i = 0; i < lines.length; i++) {
    if (Object.keys(out[i]).length > 0) {
      await recordTagging({ trade, rawText: lines[i].descriptionOriginal, tags: out[i] });
    }
  }
  return out;
}
