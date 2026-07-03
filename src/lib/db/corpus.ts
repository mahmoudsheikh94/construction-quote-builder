import { serviceClient } from "./client";

export interface LineTags {
  material?: string; dimensions?: string; grade?: string; category?: string; standardRefs?: string[];
}

export function tagSignature(trade: string, tags: LineTags): string {
  const norm = (s?: string) => (s ?? "").trim().toLowerCase();
  const refs = (tags.standardRefs ?? []).map((r) => r.trim().toLowerCase()).sort().join("|");
  // Fixed field order → order-independent, deterministic key.
  return [trade, norm(tags.category), norm(tags.material), norm(tags.dimensions), norm(tags.grade), refs].join("::");
}

// An all-empty tag set carries no discriminating info — its signature is just
// "trade::::::". Empty tags must never participate in corpus matching, or a
// degraded (untagged) line could false-positive-match another empty-tag line's
// recorded model. Batching makes empty-tag lines more likely (a degraded chunk).
export function isEmptyTags(tags: LineTags): boolean {
  return !tags.material && !tags.dimensions && !tags.grade && !tags.category
    && (!tags.standardRefs || tags.standardRefs.length === 0);
}

export async function recordTagging(input: {
  trade: string; rawText: string; tags: LineTags; costModelId?: string;
}): Promise<void> {
  const sig = tagSignature(input.trade, input.tags);
  const sc = serviceClient();
  const { error: e1 } = await sc.from("line_item_tags").insert({
    trade: input.trade, raw_text: input.rawText, tags: input.tags, signature: sig, cost_model_id: input.costModelId,
  });
  if (e1) throw e1;
  // Never register an empty-tag signature in the match fast-path — it would
  // false-positive-match any other untagged line. (The raw tag row above is
  // still kept for audit.)
  if (input.costModelId && !isEmptyTags(input.tags)) {
    // Upsert the match_corpus fast-path row, bumping hit_count.
    const { data: existing } = await sc.from("match_corpus")
      .select("id, hit_count").eq("trade", input.trade).eq("signature", sig).maybeSingle();
    if (existing) {
      const { error } = await sc.from("match_corpus")
        .update({ hit_count: existing.hit_count + 1, updated_at: new Date().toISOString(), cost_model_id: input.costModelId })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await sc.from("match_corpus")
        .insert({ trade: input.trade, signature: sig, cost_model_id: input.costModelId });
      if (error) throw error;
    }
  }
}

export async function lookupBySignature(trade: string, tags: LineTags): Promise<{ costModelId: string; hitCount: number } | null> {
  if (isEmptyTags(tags)) return null; // empty tags never match the corpus (see isEmptyTags)
  const sig = tagSignature(trade, tags);
  const { data, error } = await serviceClient()
    .from("match_corpus").select("cost_model_id, hit_count").eq("trade", trade).eq("signature", sig).maybeSingle();
  if (error) throw error;
  return data ? { costModelId: data.cost_model_id, hitCount: data.hit_count } : null;
}
