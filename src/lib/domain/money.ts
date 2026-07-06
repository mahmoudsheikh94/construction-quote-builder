export type Fils = number;

const JD_RE = /^\d+(\.\d{1,3})?$/;
const DEC_RE = /^\d+(\.\d{1,6})?$/;

export function parseJDToFils(s: string): Fils {
  const t = s.trim();
  if (!JD_RE.test(t)) throw new Error(`قيمة دينار غير صالحة: ${s}`);
  const [whole, frac = ""] = t.split(".");
  return Number(whole) * 1000 + Number(frac.padEnd(3, "0"));
}

export function filsToJDString(f: Fils): string {
  assertIntFils(f);
  const jd = Math.floor(f / 1000);
  const fils = f % 1000;
  return `${jd}.${String(fils).padStart(3, "0")}`;
}

export function parseDecimalToMicro(s: string): bigint {
  const t = s.trim();
  if (!DEC_RE.test(t)) throw new Error(`قيمة عشرية غير صالحة: ${s}`);
  const [whole, frac = ""] = t.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(frac.padEnd(6, "0"));
}

export function roundDivHalfUp(n: bigint, d: bigint): bigint {
  if (n < 0n || d <= 0n) throw new Error("roundDivHalfUp: n ≥ 0 و d > 0 مطلوبان");
  const q = n / d;
  const r = n % d;
  return r * 2n >= d ? q + 1n : q;
}

// Signed half-away-from-zero division. Unlike roundDivHalfUp (which requires
// n >= 0), this accepts a negative numerator — needed for signed bps error metrics.
export function roundHalfAwayFromZero(n: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error("roundHalfAwayFromZero: d != 0 مطلوب");
  const sign = n < 0n !== d < 0n ? -1n : 1n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = an / ad;
  const r = an % ad;
  const mag = r * 2n >= ad ? q + 1n : q;
  return sign * mag;
}

export function lineAmountFils(qtyThousandths: number, rateFils: Fils): Fils {
  assertIntFils(rateFils);
  if (!Number.isInteger(qtyThousandths) || qtyThousandths < 0) {
    throw new Error(`كمية غير صالحة: ${qtyThousandths}`);
  }
  return Number(roundDivHalfUp(BigInt(qtyThousandths) * BigInt(rateFils), 1000n));
}

export function sumFils(xs: Fils[]): Fils {
  return xs.reduce((acc: number, x) => {
    assertIntFils(x);
    return acc + x;
  }, 0);
}

function assertIntFils(f: number): void {
  if (!Number.isInteger(f) || f < 0) throw new Error(`قيمة فلس غير صالحة: ${f}`);
}
