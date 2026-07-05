import type { ProjectOverrides } from "./overrides";
import type { FirmSettings } from "@/lib/db/firm-settings";

// Overlay per-quote overrides on top of firm defaults, field by field (per-quote wins).
// Burden and overhead come from firm settings unless the quote overrides them; profit,
// location, size and target date are per-quote (no firm default).
export function buildProjectOverrides(input: {
  firm: FirmSettings;
  quoteOverrides?: Partial<ProjectOverrides>;
}): ProjectOverrides {
  const q = input.quoteOverrides ?? {};
  return {
    ...q,
    laborBurdenPct: q.laborBurdenPct ?? input.firm.laborBurdenPct,
    profitPct: q.profitPct,
    locationFactor: q.locationFactor,
    sizeFactor: q.sizeFactor,
    targetDate: q.targetDate,
  };
}
