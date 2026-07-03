// Deterministic Levantine/MSA cardinal parser for BOQ quantity-in-words.
// Handles the forms seen in real Jordanian BOQs: units, teens, tens (with "و" and-joins),
// hundreds (مئة/مائة + compounds like سبعمائة), and thousands (ألف/ألفان/آلاف).
const UNITS: Record<string, number> = {
  "صفر": 0, "واحد": 1, "واحدة": 1, "اثنان": 2, "اثنين": 2, "ثلاثة": 3, "أربعة": 4, "اربعة": 4,
  "خمسة": 5, "ستة": 6, "سبعة": 7, "ثمانية": 8, "تسعة": 9,
};
const TEN = 10;
const TEENS: Record<string, number> = {
  "عشرة": 10, "أحد عشر": 11, "احد عشر": 11, "اثنا عشر": 12, "اثني عشر": 12, "ثلاثة عشر": 13,
  "أربعة عشر": 14, "اربعة عشر": 14, "خمسة عشر": 15, "ستة عشر": 16, "سبعة عشر": 17,
  "ثمانية عشر": 18, "تسعة عشر": 19,
};
const TENS: Record<string, number> = {
  "عشرون": 20, "عشرين": 20, "ثلاثون": 30, "ثلاثين": 30, "أربعون": 40, "اربعون": 40, "اربعين": 40,
  "خمسون": 50, "خمسين": 50, "ستون": 60, "ستين": 60, "سبعون": 70, "سبعين": 70,
  "ثمانون": 80, "ثمانين": 80, "تسعون": 90, "تسعين": 90,
};
const HUNDREDS: Record<string, number> = {
  "مئة": 100, "مائة": 100, "مئتان": 200, "مئتين": 200, "مائتان": 200, "مائتين": 200,
  "ثلاثمائة": 300, "ثلاثمئة": 300, "أربعمائة": 400, "اربعمائة": 400, "خمسمائة": 500, "خمسمئة": 500,
  "ستمائة": 600, "ستمئة": 600, "سبعمائة": 700, "سبعمئة": 700, "ثمانمائة": 800, "ثمانمئة": 800,
  "تسعمائة": 900, "تسعمئة": 900,
};
const THOUSAND_WORDS = new Set(["ألف", "الف", "آلاف", "الاف"]);
const TWO_THOUSAND = new Set(["ألفان", "الفان", "ألفين", "الفين"]);

export function arabicCardinalToInt(words: string): number | null {
  if (!words || !words.trim()) return null;
  const toks = words
    .replace(/[،,]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t, idx) => {
      // Strip leading "و" (and-connector) from tokens after the first
      if (idx > 0 && t.startsWith("و")) {
        return t.substring(1);
      }
      return t;
    })
    .filter(Boolean);
  if (toks.length === 0) return null;

  let total = 0, current = 0, matchedAny = false, i = 0;
  const consumeTeen = (a: string, b?: string): number | null => {
    if (b && TEENS[`${a} ${b}`] !== undefined) return TEENS[`${a} ${b}`];
    return null;
  };

  while (i < toks.length) {
    const t = toks[i], t2 = toks[i + 1];
    const teen = consumeTeen(t, t2);
    if (teen !== null) { current += teen; matchedAny = true; i += 2; continue; }
    if (TWO_THOUSAND.has(t)) { total += 2000; current = 0; matchedAny = true; i++; continue; }
    if (THOUSAND_WORDS.has(t)) { total += (current || 1) * 1000; current = 0; matchedAny = true; i++; continue; }
    if (HUNDREDS[t] !== undefined) { current += HUNDREDS[t]; matchedAny = true; i++; continue; }
    if (TENS[t] !== undefined) { current += TENS[t]; matchedAny = true; i++; continue; }
    if (TEENS[t] !== undefined) { current += TEENS[t]; matchedAny = true; i++; continue; }
    if (UNITS[t] !== undefined) { current += UNITS[t]; matchedAny = true; i++; continue; }
    i++; // skip filler/unknown token
  }
  if (!matchedAny) return null;
  return total + current;
}
