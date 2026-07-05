"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { LaborRateInput } from "./types";

function cleanProductivity(input: LaborRateInput["productivity"]) {
  return input
    .map((p) => ({
      label: p.label.trim(),
      output_per_day: p.output_per_day,
      unit: (p.unit || "").trim() || "m²",
    }))
    .filter((p) => p.label && Number.isFinite(p.output_per_day));
}

function validate(input: LaborRateInput) {
  const name = input.name.trim();
  const currency = (input.currency || "JOD").trim() || "JOD";
  if (!name) throw new Error("اسم المهنة مطلوب");
  if (!Number.isFinite(input.day_rate)) throw new Error("أجرة اليوم يجب أن تكون رقمًا");
  return { name, currency, day_rate: input.day_rate };
}

export async function createLaborRate(input: LaborRateInput): Promise<void> {
  const { name, currency, day_rate } = validate(input);
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("labor_rates")
    .insert({ name, day_rate, currency })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const productivity = cleanProductivity(input.productivity);
  if (productivity.length > 0) {
    const { error: pErr } = await supabase
      .from("labor_rate_productivity")
      .insert(productivity.map((p) => ({ labor_rate_id: row.id, ...p })));
    if (pErr) throw new Error(pErr.message);
  }

  revalidatePath("/labor-rates");
}

export async function updateLaborRate(id: string, input: LaborRateInput): Promise<void> {
  const { name, currency, day_rate } = validate(input);
  const supabase = await createClient();

  const { error } = await supabase
    .from("labor_rates")
    .update({ name, day_rate, currency })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Replace productivity rows wholesale (simple + predictable for a small list).
  const { error: delErr } = await supabase
    .from("labor_rate_productivity")
    .delete()
    .eq("labor_rate_id", id);
  if (delErr) throw new Error(delErr.message);

  const productivity = cleanProductivity(input.productivity);
  if (productivity.length > 0) {
    const { error: pErr } = await supabase
      .from("labor_rate_productivity")
      .insert(productivity.map((p) => ({ labor_rate_id: id, ...p })));
    if (pErr) throw new Error(pErr.message);
  }

  revalidatePath("/labor-rates");
}

export async function deleteLaborRate(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("labor_rates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/labor-rates");
}

export async function addDayLog(input: import("./day-log-core").DayLogFormInput): Promise<void> {
  const { addDayLogCore } = await import("./day-log-core");
  await addDayLogCore(input);
  revalidatePath("/labor-rates");
}
