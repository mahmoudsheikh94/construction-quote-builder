import { roundHalfAwayFromZero, parseJDToFils } from "@/lib/domain/money";
import type { PricedRow } from "@/lib/export/priced-boq";
import type { GoldenLineRow, ScoreSummary, ScoredLine, TradeMetrics } from "./types";
import { alignLines, type PricedLineForAlign } from "./align";

const UNPRICED_FLAGS = new Set(["NO_MATCH", "NEEDS_MANUAL"]);

function pctInt(numer: number, denom: number): number {
  if (denom === 0) return 0;
  return Number(roundHalfAwayFromZero(BigInt(numer) * 100n, BigInt(denom)));
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Number(roundHalfAwayFromZero(BigInt(s[mid - 1] + s[mid]), 2n));
}

function meanSigned(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return Number(roundHalfAwayFromZero(BigInt(xs.reduce((a, b) => a + b, 0)), BigInt(xs.length)));
}

function metricsFor(errs: number[]): TradeMetrics {
  const abs = errs.map((e) => Math.abs(e));
  return {
    within5: pctInt(abs.filter((e) => e <= 500).length, abs.length),
    within10: pctInt(abs.filter((e) => e <= 1000).length, abs.length),
    within20: pctInt(abs.filter((e) => e <= 2000).length, abs.length),
    medianAbsBps: median(abs),
    meanSignedBps: meanSigned(errs),
    count: errs.length,
  };
}

// Pure, deterministic, integer-fils. All metrics are signed integer basis points.
export function scoreQuote(input: { pricedRows: PricedRow[]; goldenLines: GoldenLineRow[] }): ScoreSummary {
  const priced: PricedLineForAlign[] = input.pricedRows.map((r, i) => ({
    position: i,
    itemCode: r.itemCode,
    descriptionOriginal: r.description,
    unitCanonical: (r.unit ?? null) as string | null,
    rateFils: r.rateJD == null ? null : parseJDToFils(r.rateJD),
    flags: r.flags,
  }));
  const pairs = alignLines(priced, input.goldenLines);
  const goldenBySort = new Map(input.goldenLines.map((g) => [g.sortOrder, g]));

  const lines: ScoredLine[] = [];
  const absErrs: number[] = [];
  const signedErrs: number[] = [];
  const byTradeAcc = new Map<string, number[]>();
  let estAmount = 0n, truthAmount = 0n;
  let pricedCount = 0, pricedAligned = 0;

  for (const p of priced) {
    const pair = pairs.find((x) => x.position === p.position)!;
    const g = pair.sortOrder == null ? undefined : goldenBySort.get(pair.sortOrder);
    const isPriced = p.rateFils != null && !p.flags.some((f) => UNPRICED_FLAGS.has(f));
    if (isPriced) pricedCount++;

    let eBps: number | null = null;
    if (isPriced && g && g.truthRateFils != null && g.truthRateFils !== 0) {
      pricedAligned++;
      eBps = Number(roundHalfAwayFromZero(BigInt(p.rateFils! - g.truthRateFils) * 10000n, BigInt(g.truthRateFils)));
      absErrs.push(Math.abs(eBps));
      signedErrs.push(eBps);
      const t = g.trade ?? "__untraded__";
      if (!byTradeAcc.has(t)) byTradeAcc.set(t, []);
      byTradeAcc.get(t)!.push(eBps);
      const row = input.pricedRows[p.position];
      if (row.amountJD != null) estAmount += BigInt(parseJDToFils(row.amountJD));
      if (g.truthAmountFils != null) truthAmount += BigInt(g.truthAmountFils);
    }
    lines.push({ position: p.position, matched: pair.sortOrder != null, priced: isPriced, eBps });
  }

  const byTrade: Record<string, TradeMetrics> = {};
  for (const [trade, errs] of byTradeAcc) byTrade[trade] = metricsFor(errs);

  return {
    within5: pctInt(absErrs.filter((e) => e <= 500).length, absErrs.length),
    within10: pctInt(absErrs.filter((e) => e <= 1000).length, absErrs.length),
    within20: pctInt(absErrs.filter((e) => e <= 2000).length, absErrs.length),
    medianAbsBps: median(absErrs),
    meanSignedBps: meanSigned(signedErrs),
    grandTotalDevBps: truthAmount === 0n ? null : Number(roundHalfAwayFromZero((estAmount - truthAmount) * 10000n, truthAmount)),
    coverage: pctInt(pricedAligned, pricedCount),
    byTrade,
    lines,
  };
}
