import { z } from "zod";
import type { AIAdapter } from "@/lib/ai/adapter";
import type { ExtractionResult, RawLine } from "./types";
import { arabicCardinalToInt } from "./arabic-words";

export function pageRanges(pageCount: number, chunkSize: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let start = 1; start <= pageCount; start += chunkSize) {
    ranges.push([start, Math.min(start + chunkSize - 1, pageCount)]);
  }
  return ranges;
}

const RawLineSchema = z.object({
  itemCode: z.string().optional(),
  sectionRef: z.string(),
  descriptionOriginal: z.string(),
  unitRaw: z.string().optional(),
  quantityRaw: z.string().optional(),
  quantityWords: z.string().optional(),
});
export const RAW_LINES_SCHEMA = z.object({ lines: z.array(RawLineSchema) });

export function checksumWarnings(lines: RawLine[]): string[] {
  const warnings: string[] = [];
  for (const line of lines) {
    if (!line.quantityWords || !line.quantityRaw) continue;
    const fromWords = arabicCardinalToInt(line.quantityWords);
    if (fromWords === null) continue;
    const numeric = Number(String(line.quantityRaw).replace(/[,٬\s]/g, ""));
    if (!Number.isFinite(numeric)) continue;
    if (Math.round(numeric) !== fromWords) {
      warnings.push(`تعارض في الكمية للبند ${line.sortOrder} (${line.itemCode ?? ""}): رقم=${numeric} كتابة=${fromWords}`);
    }
  }
  return warnings;
}

// pdfjs is lazy-imported here (not at module scope) so that importing pdf.ts for the pure
// pageRanges/checksumWarnings functions never touches pdfjs's Node/worker setup. Only
// ingestPdf (via pageCount) pays that cost, and only at call time.
async function pageCount(path: string): Promise<number> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ url: path }).promise;
  return doc.numPages;
}

const EXTRACT_SYSTEM = `أنت مستخرج بنود جداول كميات إنشائية (BOQ). استخرج كل بند سطراً سطراً من الصفحات المرفقة.
لكل بند أعِد: itemCode (رقم البند مثل 2/1)، sectionRef (الجزء قبل / من رقم البند)، descriptionOriginal (الوصف كما هو حرفياً بلغته الأصلية)، unitRaw (الوحدة كما كُتبت: م3، م2، عدد...)، quantityRaw (الكمية بالأرقام)، quantityWords (الكمية بالحروف إن وُجدت).
لا تحسب أي أسعار. لا تخترع بنوداً. أعِد JSON فقط بالشكل: {"lines":[...]}. حافظ على الترتيب.`;

export async function ingestPdf(
  path: string,
  adapter: AIAdapter,
  opts?: { chunkSize?: number; maxChunks?: number },
): Promise<ExtractionResult> {
  const chunkSize = opts?.chunkSize ?? 6;
  const pages = await pageCount(path);
  let ranges = pageRanges(pages, chunkSize);
  // maxChunks bounds cost/latency on a first run — extract only the first N chunks.
  if (opts?.maxChunks !== undefined) ranges = ranges.slice(0, opts.maxChunks);
  const all: RawLine[] = [];
  const warnings: string[] = [];

  for (const [from, to] of ranges) {
    try {
      const res = await adapter.run<{ lines: Array<Omit<RawLine, "sortOrder">> }>({
        system: EXTRACT_SYSTEM,
        prompt: `استخرج البنود من الصفحات ${from} إلى ${to} من ملف جدول الكميات.`,
        files: [path],
        schema: RAW_LINES_SCHEMA,
      });
      for (const l of res.lines) all.push({ ...l, sortOrder: all.length });
    } catch (e) {
      warnings.push(`فشل استخراج الصفحات ${from}-${to}: ${String(e)}`);
    }
  }
  warnings.push(...checksumWarnings(all));
  return { lines: all, warnings };
}
