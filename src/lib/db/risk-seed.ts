import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "./client";

// Optimism uplift lookup: archetype × stage (1..5) -> uplift %.
export async function getOptimismUplift(
  archetype: string, stage: number, db: SupabaseClient = serviceClient(),
): Promise<number | null> {
  const { data } = await db
    .from("optimism_uplift").select("pct").eq("archetype", archetype).eq("stage", stage).maybeSingle();
  return data ? Number(data.pct) : null;
}

// Scope template: required trade keys for a project type.
export async function getScopeTemplate(
  projectType: string, db: SupabaseClient = serviceClient(),
): Promise<string[] | null> {
  const { data } = await db
    .from("scope_templates").select("required_items").eq("project_type", projectType).maybeSingle();
  return data ? (data.required_items as string[]) : null;
}
