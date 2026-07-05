import type { Flag } from "./types";

// $/m² sanity check per trade + project total against the firm's learned band.
// Skips all $/m² checks when GFA is null (no flag, no null-divide). A band is a
// learned value (fils per m²); flag when the actual deviates > 15%.
export function checkSanityBand(input: {
  grossFloorAreaM2: number | null;
  tradeTotalsFils: Record<string, number>; // trade -> total fils
  grandTotalFils: number;
  bands: Map<string, number>; // key -> learned fils/m² (keys already resolved by caller)
  totalKey: string;
  tradeKey: (trade: string) => string;
}): Flag[] {
  if (input.grossFloorAreaM2 == null || input.grossFloorAreaM2 <= 0) return [];
  const flags: Flag[] = [];
  const check = (label: string, totalFils: number, bandKey: string) => {
    const band = input.bands.get(bandKey);
    if (band == null || band <= 0) return; // below confidence -> skip silently
    const perM2 = totalFils / input.grossFloorAreaM2!;
    const dev = Math.abs(perM2 - band) / band;
    if (dev > 0.15) {
      flags.push({
        code: "SANITY_BAND", severity: "warning",
        messageAr: `تكلفة/م² خارج النطاق المعتاد (${label}): ${Math.round(dev * 100)}%`,
        detail: { label, perM2: Math.round(perM2), band },
      });
    }
  };
  check("الإجمالي", input.grandTotalFils, input.totalKey);
  for (const [trade, total] of Object.entries(input.tradeTotalsFils)) {
    check(trade, total, input.tradeKey(trade));
  }
  return flags;
}
