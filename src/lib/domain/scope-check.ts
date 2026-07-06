import type { Flag } from "./types";

// Emit one SCOPE_GAP flag per required trade absent from the priced BOQ.
export function checkScopeGap(coveredTrades: Set<string>, required: string[]): Flag[] {
  const flags: Flag[] = [];
  for (const trade of required) {
    if (!coveredTrades.has(trade)) {
      flags.push({
        code: "SCOPE_GAP", severity: "warning",
        messageAr: `مهنة مطلوبة غير مغطاة في جدول الكميات: ${trade}`,
        detail: { requiredItem: trade },
      });
    }
  }
  return flags;
}
