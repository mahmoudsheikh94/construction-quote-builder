// Persist a crew-day log entry (feeds the variance loop). Resolves to a cost model
// + labor component so the achieved productivity can nudge the right norm.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { insertDayLog } from "@/lib/db/day-log";

export interface DayLogFormInput {
  trade: string;
  task?: string;
  costModelId?: string;
  componentId?: string;
  date: string;
  crewSkilled: string;
  crewHelpers: string;
  hoursWorked: string;
  quantityInstalled: string;
  unitCanonical: string;
  reworkQuantity?: string;
}

const num = (s?: string) => (s == null || s === "" ? 0 : Number(s));

export async function addDayLogCore(input: DayLogFormInput, db?: SupabaseClient): Promise<void> {
  const sc = db ?? (await createClient());
  await insertDayLog({
    projectId: null, laborRateId: null,
    trade: input.trade, task: input.task ?? null,
    costModelId: input.costModelId || null, componentId: input.componentId || null,
    date: input.date,
    crewSkilled: num(input.crewSkilled), crewHelpers: num(input.crewHelpers),
    hoursWorked: num(input.hoursWorked), quantityInstalled: num(input.quantityInstalled),
    unitCanonical: input.unitCanonical, reworkQuantity: num(input.reworkQuantity),
  }, sc);
}
