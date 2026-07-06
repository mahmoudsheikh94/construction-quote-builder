// Description normalization for alignment. Deterministic, float-free.
export function normDesc(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "") // Arabic diacritics + tatweel
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normCode(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Token-set Jaccard >= pct%, compared as an integer ratio (no floats).
export function jaccardGe(a: string, b: string, pct: number): boolean {
  const ta = new Set(normDesc(a).split(" ").filter(Boolean));
  const tb = new Set(normDesc(b).split(" ").filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return inter * 100 >= pct * union;
}
