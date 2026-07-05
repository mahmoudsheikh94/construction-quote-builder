import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "./client";
import type { GoldenLineRow } from "@/lib/backtest/types";

export interface GoldenCaseInput {
  slug: string;
  nameAr: string;
  projectType: string;
  inputPath: string;
  pricedPath: string | null;
  profileSlug: string;
  truthSource: "priced-tender" | "actual-outturn" | "none";
  projectId?: string | null;
}

export interface GoldenCase {
  id: string;
  slug: string;
  projectType: string;
  inputPath: string;
  pricedPath: string | null;
  profileSlug: string;
  truthSource: "priced-tender" | "actual-outturn" | "none";
  projectId: string | null;
}

export async function insertGoldenCase(
  c: GoldenCaseInput,
  db: SupabaseClient = serviceClient(),
): Promise<{ id: string }> {
  const { data, error } = await db
    .from("golden_cases")
    .insert({
      slug: c.slug, name_ar: c.nameAr, project_type: c.projectType,
      input_path: c.inputPath, priced_path: c.pricedPath, profile_slug: c.profileSlug,
      project_id: c.projectId ?? null, truth_source: c.truthSource,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id };
}

export async function insertGoldenLines(
  caseId: string,
  lines: GoldenLineRow[],
  db: SupabaseClient = serviceClient(),
): Promise<void> {
  if (lines.length === 0) return;
  const rows = lines.map((l) => ({
    case_id: caseId, sort_order: l.sortOrder, item_code: l.itemCode,
    description_original: l.descriptionOriginal, unit_canonical: l.unitCanonical,
    quantity_thousandths: null, truth_rate_fils: l.truthRateFils,
    truth_amount_fils: l.truthAmountFils, trade: l.trade, truth_source: "priced-tender",
  }));
  const { error } = await db.from("golden_lines").insert(rows);
  if (error) throw new Error(error.message);
}

function mapCase(d: Record<string, unknown>): GoldenCase {
  return {
    id: d.id as string, slug: d.slug as string, projectType: d.project_type as string,
    inputPath: d.input_path as string, pricedPath: (d.priced_path as string | null) ?? null,
    profileSlug: d.profile_slug as string,
    truthSource: d.truth_source as GoldenCase["truthSource"],
    projectId: (d.project_id as string | null) ?? null,
  };
}

export async function getCaseBySlug(
  slug: string,
  db: SupabaseClient = serviceClient(),
): Promise<GoldenCase | null> {
  const { data } = await db.from("golden_cases").select("*").eq("slug", slug).maybeSingle();
  return data ? mapCase(data) : null;
}

export async function getGoldenLines(
  caseId: string,
  db: SupabaseClient = serviceClient(),
): Promise<GoldenLineRow[]> {
  const { data, error } = await db
    .from("golden_lines").select("*").eq("case_id", caseId).order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    sortOrder: r.sort_order, itemCode: r.item_code, descriptionOriginal: r.description_original,
    unitCanonical: r.unit_canonical,
    truthRateFils: r.truth_rate_fils == null ? null : Number(r.truth_rate_fils),
    truthAmountFils: r.truth_amount_fils == null ? null : Number(r.truth_amount_fils),
    trade: r.trade,
  }));
}

export async function listScoredCases(
  db: SupabaseClient = serviceClient(),
): Promise<GoldenCase[]> {
  const { data } = await db
    .from("golden_cases").select("*").neq("truth_source", "none").order("slug");
  return (data ?? []).map(mapCase);
}

export async function saveBacktestRun(
  input: { caseId: string; label: string | null; config: object; summary: object },
  db: SupabaseClient = serviceClient(),
): Promise<{ id: string }> {
  const { data, error } = await db
    .from("backtest_runs")
    .insert({ case_id: input.caseId, label: input.label, config: input.config, summary: input.summary })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id };
}

export async function getRunsByLabel(
  label: string,
  db: SupabaseClient = serviceClient(),
): Promise<Array<{ case_id: string; summary: Record<string, unknown> }>> {
  const { data } = await db
    .from("backtest_runs").select("case_id, summary").eq("label", label)
    .order("scored_at", { ascending: false });
  return (data ?? []) as Array<{ case_id: string; summary: Record<string, unknown> }>;
}
