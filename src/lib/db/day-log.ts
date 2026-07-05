import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "./client";

export interface DayLogEntry {
  id: string;
  projectId: string | null;
  laborRateId: string | null;
  trade: string;
  task: string | null;
  costModelId: string | null;
  componentId: string | null;
  date: string;
  crewSkilled: number;
  crewHelpers: number;
  hoursWorked: number;
  quantityInstalled: number;
  unitCanonical: string;
  reworkQuantity: number;
}

export async function insertDayLog(e: Omit<DayLogEntry, "id">, db: SupabaseClient = serviceClient()): Promise<{ id: string }> {
  const { data, error } = await db
    .from("day_log_entries")
    .insert({
      project_id: e.projectId, labor_rate_id: e.laborRateId, trade: e.trade, task: e.task,
      cost_model_id: e.costModelId, component_id: e.componentId, date: e.date,
      crew_skilled: e.crewSkilled, crew_helpers: e.crewHelpers, hours_worked: e.hoursWorked,
      quantity_installed: e.quantityInstalled, unit_canonical: e.unitCanonical, rework_quantity: e.reworkQuantity,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id };
}

export async function listDayLog(db: SupabaseClient = serviceClient()): Promise<DayLogEntry[]> {
  const { data, error } = await db.from("day_log_entries").select("*").order("date");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, projectId: r.project_id, laborRateId: r.labor_rate_id, trade: r.trade, task: r.task,
    costModelId: r.cost_model_id, componentId: r.component_id, date: r.date,
    crewSkilled: r.crew_skilled, crewHelpers: r.crew_helpers, hoursWorked: Number(r.hours_worked),
    quantityInstalled: Number(r.quantity_installed), unitCanonical: r.unit_canonical, reworkQuantity: Number(r.rework_quantity),
  }));
}
