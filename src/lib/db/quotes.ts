import { serviceClient } from "./client";
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

export async function createProject(input: { name: string; projectType?: string; description?: string }) {
  const { data, error } = await serviceClient()
    .from("projects")
    .insert({ name: input.name, project_type: input.projectType, description: input.description })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function createQuote(projectId: string) {
  const { data, error } = await serviceClient()
    .from("quotes").insert({ project_id: projectId }).select("id").single();
  if (error) throw error;
  return data;
}

export async function insertLineItems(quoteId: string, items: NewLineItem[]) {
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
  const { error } = await serviceClient().from("line_items").insert(rows);
  if (error) throw error;
}

export async function getQuoteItems(quoteId: string): Promise<LineItemRow[]> {
  const { data, error } = await serviceClient()
    .from("line_items").select("*").eq("quote_id", quoteId).order("sort_order");
  if (error) throw error;
  return data as LineItemRow[];
}
