import type { CanonicalUnit, Flag } from "./types";
import type { QuoteRollup } from "./rollup";

export function validateUnit(itemUnit: CanonicalUnit | null, modelUnit: CanonicalUnit): Flag[] {
  if (itemUnit === null) {
    return [{ code: "UNIT_UNKNOWN", severity: "error", messageAr: "وحدة القياس غير معروفة" }];
  }
  if (itemUnit !== modelUnit) {
    return [{
      code: "UNIT_MISMATCH", severity: "error",
      messageAr: `وحدة البند (${itemUnit}) لا تطابق وحدة نموذج التسعير (${modelUnit})`,
      detail: { itemUnit, modelUnit },
    }];
  }
  return [];
}

export function validateBand(
  rateFils: number,
  band?: { minRateFils: number; maxRateFils: number },
): Flag[] {
  if (!band) return [];
  if (rateFils < band.minRateFils || rateFils > band.maxRateFils) {
    return [{
      code: "OUT_OF_BAND", severity: "warning",
      messageAr: "السعر المحسوب خارج النطاق المعقول لهذا البند",
      detail: { rateFils, ...band },
    }];
  }
  return [];
}

export function checkRatios(
  rollup: QuoteRollup,
  checks: Array<{ sectionMatch: string; minPct: number; maxPct: number; labelAr: string }>,
): Flag[] {
  if (rollup.grandTotalFils === 0) return [];
  const flags: Flag[] = [];
  for (const check of checks) {
    const total = rollup.sections
      .filter((s) => s.sectionRef === check.sectionMatch || s.sectionRef.startsWith(`${check.sectionMatch}/`))
      .reduce((a, s) => a + s.totalFils, 0);
    const pct = (total / rollup.grandTotalFils) * 100;
    if (pct < check.minPct || pct > check.maxPct) {
      flags.push({
        code: "RATIO_WARNING", severity: "warning",
        messageAr: `نسبة ${check.labelAr} من الإجمالي (${pct.toFixed(1)}٪) خارج النطاق المتوقع`,
        detail: { sectionMatch: check.sectionMatch, pct, minPct: check.minPct, maxPct: check.maxPct },
      });
    }
  }
  return flags;
}
