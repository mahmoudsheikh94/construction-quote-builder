import { serviceClient } from "./client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalUnit, ItemType } from "@/lib/domain/types";

export type { ItemType };

export interface NewLineItem {
  sortOrder: number;
  itemCode?: string;
  sectionRef: string;
  descriptionOriginal: string;
  unitRaw?: string;
  unitCanonical?: CanonicalUnit | null;
  quantityThousandths?: number | null;
  itemType?: ItemType;
}

export interface LineItemRow {
  id: string;
  quote_id: string;
  sort_order: number;
  item_code: string | null;
  section_ref: string;
  description_original: string;
  unit_raw: string | null;
  unit_canonical: string | null;
  quantity_thousandths: number | null;
  item_type: ItemType;
  rate_fils: number | null;
  amount_fils: number | null;
  flags: unknown[];
}

export async function createProject(input: { name: string; projectType?: string; description?: string }, db: SupabaseClient = serviceClient()) {
  const { data, error } = await db
    .from("projects")
    .insert({ name: input.name, project_type: input.projectType, description: input.description })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function createQuote(projectId: string, db: SupabaseClient = serviceClient()) {
  const { data, error } = await db
    .from("quotes").insert({ project_id: projectId }).select("id").single();
  if (error) throw error;
  return data;
}

export async function insertLineItems(quoteId: string, items: NewLineItem[], db: SupabaseClient = serviceClient()) {
  const rows = items.map((i) => ({
    quote_id: quoteId,
    sort_order: i.sortOrder,
    item_code: i.itemCode,
    section_ref: i.sectionRef,
    description_original: i.descriptionOriginal,
    unit_raw: i.unitRaw,
    unit_canonical: i.unitCanonical,
    quantity_thousandths: i.quantityThousandths,
    item_type: i.itemType ?? "unit_rate",
  }));
  const { error } = await db.from("line_items").insert(rows);
  if (error) throw error;
}

export async function getQuoteItems(quoteId: string, db: SupabaseClient = serviceClient()): Promise<LineItemRow[]> {
  const { data, error } = await db
    .from("line_items").select("*").eq("quote_id", quoteId).order("sort_order");
  if (error) throw error;
  return data as LineItemRow[];
}

export interface SaveRow {
  sortOrder: number; itemCode?: string; sectionRef: string; description: string;
  unitRaw?: string; unitCanonical?: CanonicalUnit | null;
  quantityThousandths?: number | null; itemType: ItemType;
  rateFils: number | null; amountFils: number | null; flags: string[];
}

export async function saveQuote(input: { name: string; rows: SaveRow[] }, db: SupabaseClient = serviceClient()): Promise<{ quoteId: string }> {
  const sc = db;
  const proj = await createProject({ name: input.name }, sc);
  const { data: q, error: qErr } = await sc.from("quotes")
    .insert({ project_id: proj.id, name: input.name, status: "final" }).select("id").single();
  if (qErr) throw qErr;
  const rows = input.rows.map((r) => ({
    quote_id: q.id, sort_order: r.sortOrder, item_code: r.itemCode, section_ref: r.sectionRef,
    description_original: r.description, unit_raw: r.unitRaw, unit_canonical: r.unitCanonical,
    quantity_thousandths: r.quantityThousandths, item_type: r.itemType,
    rate_fils: r.rateFils, amount_fils: r.amountFils, flags: r.flags,
  }));
  const { error: lErr } = await sc.from("line_items").insert(rows);
  if (lErr) throw lErr;
  return { quoteId: q.id };
}

export async function listQuotes(db: SupabaseClient = serviceClient()) {
  const sc = db;
  const { data: quotes, error } = await sc.from("quotes")
    .select("id, name, created_at").order("created_at", { ascending: false });
  if (error) throw error;
  const out = [];
  for (const q of quotes) {
    const { data: lines } = await sc.from("line_items")
      .select("amount_fils, flags").eq("quote_id", q.id);
    const grandTotalFils = (lines ?? []).reduce((a, l) => a + (l.amount_fils ?? 0), 0);
    const flaggedCount = (lines ?? []).filter((l) => Array.isArray(l.flags) && l.flags.length > 0).length;
    out.push({ id: q.id, name: q.name, createdAt: q.created_at, grandTotalFils, flaggedCount });
  }
  return out;
}

export async function getQuote(id: string, db: SupabaseClient = serviceClient()): Promise<{ id: string; name: string | null; lines: LineItemRow[] }> {
  const sc = db;
  const { data: q, error } = await sc.from("quotes").select("id, name").eq("id", id).single();
  if (error) throw error;
  const lines = await getQuoteItems(id, sc);
  return { id: q.id, name: q.name, lines };
}
