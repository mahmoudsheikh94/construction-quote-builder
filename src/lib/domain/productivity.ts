import { roundDivHalfUp } from "./money";

export interface McaaSelection {
  key: string;
  severity: "minor" | "average" | "severe";
  severeConfirmed?: boolean;
}

export interface QuoteConditions {
  mode: "mcaa" | "neca";
  mcaa?: McaaSelection[];
  neca?: { scores: Record<string, 1 | 2 | 3> };
  overtime?: { hrs: number; weeks: number };
  shift?: "day" | "second_night" | "third";
}

export interface LineConditions {
  heightBand?: string; // e.g. "10-20"
  floorBand?: string; // e.g. "3-6"
  exposure?: string; // e.g. "outdoor_hot"
}

export interface ConditionSeedTables {
  mcaa: Record<string, { minor: number; average: number; severe: number }>;
  neca: string[]; // 30 row keys
  overtimePi: Record<string, number>; // `${hrs}:${weeks}` -> index
  heightBands: Array<{ minFt: number; maxFt: number | null; upliftPct: number }>;
  floorBands: Array<{ minFloors: number; maxFloors: number; upliftPct: number }>;
  weatherBands: Record<string, number>; // exposure -> uplift %
  shiftBands: Record<string, number>; // shift_type -> uplift %
}

export interface LossResult {
  lMicro: bigint;
  breakdown: { productivityLoss: number; sources: Record<string, number> };
}

export const MAX_MCAA_FACTORS = 5;
export class TooManyMcaaFactors extends Error {}
export class UnconfirmedSevere extends Error {}

const L_MICRO = 1_000_000n;

// A single-factor uplift as a 1e6-scaled multiplier bigint (1 + pct/100).
function factorMicro(upliftPct: number): bigint {
  return L_MICRO + BigInt(upliftPct) * 10_000n;
}

// Compose factors at full precision (L_num / L_den), then reduce to one lMicro with a
// single rounding — this lMicro feeds evaluateCostModel's opts.L (roadmap §7.2).
function compose(factors: bigint[], sources: Record<string, number>): LossResult {
  let num = L_MICRO, den = L_MICRO;
  for (const f of factors) { num = num * f; den = den * L_MICRO; }
  const lMicro = roundDivHalfUp(num * L_MICRO, den);
  return { lMicro, breakdown: { productivityLoss: Number(lMicro) / 1e6, sources } };
}

// Per-line height/floor/exposure uplift, additive within L_line. Under NECA mode the
// caller has already decided which baseline rows to disable (see computeNeca).
function lineFactor(line: LineConditions | null, seed: ConditionSeedTables, sources: Record<string, number>): bigint | null {
  if (!line) return null;
  let pct = 0;
  if (line.heightBand) {
    const [lo] = line.heightBand.split("-");
    const band = seed.heightBands.find((b) => String(b.minFt) === lo);
    if (band) { pct += band.upliftPct; if (band.upliftPct) sources[`height:${line.heightBand}`] = band.upliftPct; }
  }
  if (line.floorBand) {
    const [lo] = line.floorBand.split("-");
    const band = seed.floorBands.find((b) => String(b.minFloors) === lo);
    if (band) { pct += band.upliftPct; if (band.upliftPct) sources[`floor:${line.floorBand}`] = band.upliftPct; }
  }
  if (line.exposure) {
    const up = seed.weatherBands[line.exposure];
    if (up != null) { pct += up; if (up) sources[`weather:${line.exposure}`] = up; }
  }
  return pct === 0 ? null : factorMicro(pct);
}

function computeMcaa(q: QuoteConditions, line: LineConditions | null, seed: ConditionSeedTables): LossResult {
  const sources: Record<string, number> = {};
  const sel = q.mcaa ?? [];
  if (sel.length > MAX_MCAA_FACTORS) throw new TooManyMcaaFactors(`>${MAX_MCAA_FACTORS} MCAA factors`);
  let baselinePct = 0;
  for (const s of sel) {
    if (s.severity === "severe" && s.severeConfirmed !== true) throw new UnconfirmedSevere(s.key);
    const row = seed.mcaa[s.key];
    if (!row) continue;
    const pct = s.severity === "minor" ? row.minor : s.severity === "average" ? row.average : row.severe;
    baselinePct += pct;
    sources[`mcaa:${s.key}`] = pct;
  }
  const factors = [factorMicro(baselinePct)];
  const lf = lineFactor(line, seed, sources);
  if (lf) factors.push(lf);
  return compose(factors, sources);
}

function computeNeca(q: QuoteConditions, line: LineConditions | null, seed: ConditionSeedTables): LossResult {
  const sources: Record<string, number> = {};
  const scores = q.neca?.scores ?? {};
  // Under NECA mode a per-line height override disables working_height + floors; a
  // per-line exposure override disables working_conditions — so the same physical
  // factor is never counted at both altitudes.
  const disabled = new Set<string>();
  if (line?.heightBand) { disabled.add("working_height"); disabled.add("floors"); }
  if (line?.exposure) disabled.add("working_conditions");

  let total = 0;
  for (const key of seed.neca) {
    if (disabled.has(key)) { total += 1; continue; } // disabled row scores as Normal
    total += scores[key] ?? 1;
  }
  const bandMicro = total <= 40 ? L_MICRO : total <= 70 ? 1_250_000n : 1_500_000n;
  sources["neca:total"] = total;

  const factors = [bandMicro];
  const lf = lineFactor(line, seed, sources);
  if (lf) factors.push(lf);
  return compose(factors, sources);
}

// The single entry point. Returns lMicro (for opts.L) + a breakdown of sources.
export function computeLossMultiplier(
  q: QuoteConditions,
  line: LineConditions | null,
  seed: ConditionSeedTables,
): LossResult {
  return q.mode === "neca" ? computeNeca(q, line, seed) : computeMcaa(q, line, seed);
}
