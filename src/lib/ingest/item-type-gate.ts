import type { RawLine } from "./types";
import type { ItemType } from "@/lib/domain/types";
import { normalizeUnit } from "@/lib/domain/normalize";

const PS = [/provisional\s+sum/i, /\bp\.?\s?s\.?\b/i, /مبلغ\s+احتياطي/, /احتياطي/, /مخصص/];
const DAYWORK = [/dayworks?/i, /باليومية|أعمال\s+يومية|عمل\s+باليوم/];
const PCT = [/overhead\s+and\s+profit/i, /نسبة|أرباح\s+ومصاريف/];

export function classifyItemType(line: RawLine): { itemType: ItemType; confident: boolean } {
  const d = line.descriptionOriginal ?? "";
  const unit = line.unitRaw ? normalizeUnit(line.unitRaw) : null;

  if (unit === "pct" || PCT.some((re) => re.test(d))) return { itemType: "percentage", confident: true };
  if (PS.some((re) => re.test(d))) return { itemType: "provisional_sum", confident: true };
  if (DAYWORK.some((re) => re.test(d)) || unit === "day" || unit === "night") return { itemType: "dayworks", confident: true };
  // lump sum: explicitly "مقطوع"/"L.S" AND not already caught as a provisional sum
  if (unit === "ls") return { itemType: "lump_sum", confident: true };

  // A measurable unit (m2/m3/lm/ton/nr/kg) with a normal description → unit_rate, confident.
  if (unit && ["m2", "m3", "lm", "ton", "nr", "kg", "pc"].includes(unit)) return { itemType: "unit_rate", confident: true };
  return { itemType: "unit_rate", confident: false }; // unknown unit → let the pipeline decide/flag
}
