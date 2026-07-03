import { z } from "zod";
import type { AIAdapter } from "@/lib/ai/adapter";
import type { RawLine } from "@/lib/ingest/types";
import { recordTagging, type LineTags } from "@/lib/db/corpus";

export const TAGS_SCHEMA = z.object({
  material: z.string().optional(),
  dimensions: z.string().optional(),
  grade: z.string().optional(),
  category: z.string().optional(),
  standardRefs: z.array(z.string()).optional(),
});

const TAG_SYSTEM = `أنت تصنّف بنود جداول الكميات الإنشائية. من وصف البند، استخرج سمات منظمة:
material (المادة)، dimensions (الأبعاد/السماكة)، grade (الدرجة/الرتبة)، category (التصنيف الوظيفي)، standardRefs (أرقام المواصفات المذكورة).
لا تُسعّر. أعِد JSON فقط بهذه المفاتيح؛ اترك أي مفتاح غير معروف فارغاً.`;

export async function tagLine(adapter: AIAdapter, trade: string, line: RawLine): Promise<LineTags> {
  const tags = await adapter.run<LineTags>({
    system: TAG_SYSTEM,
    prompt: `وصف البند: «${line.descriptionOriginal}»\nالوحدة: ${line.unitRaw ?? "غير محددة"}`,
    schema: TAGS_SCHEMA,
  });
  await recordTagging({ trade, rawText: line.descriptionOriginal, tags });
  return tags;
}
