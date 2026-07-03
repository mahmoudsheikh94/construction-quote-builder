import { z } from "zod";
import type { AIAdapter } from "@/lib/ai/adapter";
import type { SkillContent } from "@/lib/domain/skill-schema";
import { lookupBySignature, recordTagging, type LineTags } from "@/lib/db/corpus";

export interface MatchResult {
  trade: string; costModelId: string; method: "deterministic" | "semantic"; confidence: number;
}

const SEMANTIC_SCHEMA = z.object({
  costModelId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export async function matchLine(
  adapter: AIAdapter, trade: string, tags: LineTags, skill: SkillContent, rawText: string,
): Promise<MatchResult | null> {
  // 1. Deterministic fast path: has this exact tag-signature resolved before?
  const hit = await lookupBySignature(trade, tags);
  if (hit) return { trade, costModelId: hit.costModelId, method: "deterministic", confidence: 1 };

  // 2. Semantic fallback: let the LLM pick the nearest cost model from THIS trade's catalog.
  //    It returns only an id + confidence — never a rate.
  const catalog = skill.costModels.map((m) => `- ${m.id}: ${m.labelAr} [${m.unit}] كلمات مفتاحية: ${m.keywords.join("، ")}`).join("\n");
  const res = await adapter.run<z.infer<typeof SEMANTIC_SCHEMA>>({
    system: `اختر نموذج التسعير الأنسب من القائمة لبند جدول الكميات. أعِد المعرّف (id) الأقرب أو null إن لم يوجد ما يناسب. لا تُسعّر.`,
    prompt: `البند: «${rawText}»\nالسمات: ${JSON.stringify(tags)}\n\nنماذج التسعير المتاحة:\n${catalog}\n\nأعِد JSON: {"costModelId": "<id> أو null", "confidence": 0..1}`,
    schema: SEMANTIC_SCHEMA,
  });
  if (!res.costModelId) return null;
  if (!skill.costModels.some((m) => m.id === res.costModelId)) return null; // guard hallucinated ids

  // Record the semantic resolution so next time this signature is deterministic.
  await recordTagging({ trade, rawText, tags, costModelId: res.costModelId });
  return { trade, costModelId: res.costModelId, method: "semantic", confidence: res.confidence };
}
