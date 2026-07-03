import type { CanonicalUnit } from "./types";

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";

export function arabicIndicToLatin(s: string): string {
  let out = "";
  for (const ch of s) {
    const i = ARABIC_INDIC.indexOf(ch);
    if (i >= 0) out += String(i);
    else if (ch === "٫") out += ".";   // Arabic decimal separator
    else if (ch === "٬") continue;      // Arabic thousands separator
    else out += ch;
  }
  return out;
}

export function parseQuantityToThousandths(s: string): number {
  const t = arabicIndicToLatin(s).replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,3})?$/.test(t)) throw new Error(`كمية غير صالحة: ${s}`);
  const [whole, frac = ""] = t.split(".");
  return Number(whole) * 1000 + Number(frac.padEnd(3, "0"));
}

const UNIT_MAP: Record<string, CanonicalUnit> = {
  "م٣": "m3", "م3": "m3", "م³": "m3", "m3": "m3", "cum": "m3", "cu m": "m3",
  "م٢": "m2", "م2": "m2", "م²": "m2", "m2": "m2", "sqm": "m2", "sq m": "m2",
  "م ط": "lm", "مط": "lm", "lm": "lm", "ml": "lm", "m": "lm", "م": "lm",
  "طن": "ton", "ton": "ton", "t": "ton",
  "عدد": "nr", "no": "nr", "nos": "nr", "no.": "nr", "nr": "nr", "each": "nr", "ea": "nr", "unit": "nr", "units": "nr", "item": "nr", "items": "nr",
  // Discrete countable MEP/fit-out units common in Jordanian BOQs — all "count".
  // (Deliberately excludes ambiguous ones like "مقطع"/aluminium profiles, which
  // are usually measured per m² and should stay unknown so they flag for review.)
  "نقطة": "nr", "نقطه": "nr", "point": "nr", "pt": "nr",
  "خزانة": "nr", "خزانه": "nr", "لوحة": "nr", "لوحه": "nr", "panel": "nr",
  "قطعة": "nr", "قطعه": "nr", "set": "nr", "طقم": "nr",
  "مقطوع": "ls", "بالمقطوع": "ls", "ls": "ls", "lump sum": "ls",
  "يوم": "day", "day": "day",
  "ليلة": "night", "night": "night",
  "حبة": "pc", "pc": "pc", "pcs": "pc",
  "hr": "hr", "ساعة": "hr", "hour": "hr",
  "كغم": "kg", "kg": "kg",
  "%": "pct", "نسبة": "pct",
};

export function normalizeUnit(raw: string): CanonicalUnit | null {
  const key = arabicIndicToLatin(raw)
    .toLowerCase()
    .replace(/[.]/g, raw.includes("م.ط") ? " " : "") // م.ط → "م ط"; latin "No." → "no"
    .replace(/\s+/g, " ")
    .trim();
  // Direct attempt, then retry with dots stripped for Arabic compound units
  return UNIT_MAP[key] ?? UNIT_MAP[key.replace(/\./g, "")] ?? null;
}
