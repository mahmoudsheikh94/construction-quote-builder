import { roundDivHalfUp } from "@/lib/domain/money";

// Excel raw-number path: convert a JS number of JD to integer fils, absorbing
// IEEE floating-point artifacts (e.g. 1.1000000000000001 -> 1100).
export function parseJDNumberToFils(n: number): number {
  return Math.round(n * 1000);
}

const AR_INDIC = "٠١٢٣٤٥٦٧٨٩";
function foldDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(AR_INDIC.indexOf(d)));
}

// The ONLY currency-string parse path (PDF vision output). Arabic-Indic and
// currency-token aware. Returns null on unparseable input.
export function parsePriceToFils(raw: string): number | null {
  if (raw == null) return null;
  let s = foldDigits(String(raw).trim());
  // strip currency tokens
  s = s.replace(/jd|د\.?ا|دينار|فلس/gi, "");
  // unify separators: ٬ and , as thousands (removed); ٫ as decimal -> .
  s = s.replace(/[٬,]/g, "").replace(/٫/g, ".");
  // drop anything that is not a digit or a decimal point
  s = s.replace(/[^\d.]/g, "").trim();
  if (s === "" || s === ".") return null;
  const parts = s.split(".");
  if (parts.length > 2) return null;
  const whole = BigInt(parts[0] || "0");
  const frac = (parts[1] || "").slice(0, 6).padEnd(6, "0"); // micro precision
  const micro = whole * 1_000_000n + BigInt(frac);
  return Number(roundDivHalfUp(micro, 1000n));
}
