import { ewmaUpdate, normKey } from "./variance";
import type { LearnedNorm } from "@/lib/db/learned-norms";
import type { DayLogEntry } from "@/lib/db/day-log";

// Pure: fold day-log rows into productivity norms. For each row resolved to a
// (cost_model_id, component_id), compute the achieved productivityPerDay
// (rework-excluded output per crew-day) and EWMA-update the stored norm.
// Rows missing the resolution ids are skipped (unresolved coverage).
export function runVarianceCore(
  dayLog: DayLogEntry[],
  existing: Map<string, LearnedNorm>,
): Map<string, LearnedNorm> {
  const out = new Map<string, LearnedNorm>(existing);

  for (const r of dayLog) {
    if (!r.costModelId || !r.componentId) continue; // unresolved -> skip
    const netQty = r.quantityInstalled - r.reworkQuantity;
    const crewDays = (r.crewSkilled + r.crewHelpers) * (r.hoursWorked / 8); // crew-days worked
    if (netQty <= 0 || crewDays <= 0) continue;
    const achievedPerDay = netQty / crewDays; // units installed per crew-day

    const key = normKey("productivity", [r.trade, r.costModelId, r.componentId]);
    const mapKey = `productivity ${key}`;
    const prev = out.get(mapKey);
    const actualMicro = BigInt(Math.round(achievedPerDay * 1e6));
    const prevMicro = prev ? BigInt(Math.round(prev.value * 1e6)) : actualMicro;
    const nextMicro = prev ? ewmaUpdate(prevMicro, actualMicro) : actualMicro;
    out.set(mapKey, {
      scope: "productivity", key, value: Number(nextMicro) / 1e6, sampleSize: (prev?.sampleSize ?? 0) + 1,
    });
  }
  return out;
}
