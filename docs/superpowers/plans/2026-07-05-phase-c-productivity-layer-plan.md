# Phase C: Productivity-Modifier Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the condition-neutral rate into a condition-aware one by computing a single per-line productivity loss multiplier `L ≥ 1` (from an MCAA factor checklist OR a NECA questionnaire, layered with per-line height/exposure overrides) and folding it into the same fixed-point labor division burden already uses — gated by the Phase-A backtest.

**Architecture:** Seven firm-editable seed tables hold the court-tested lookup values. A pure `computeLossMultiplier` composes `L` as a full-precision rational (one rounding) with all guardrails (MCAA additive, cap 5, severe-confirm, MCAA/NECA mutual exclusivity, per-line-vs-baseline de-dup). Phase B already changed `evaluateCostModel`'s signature to `{ burdenNum, L }`; this phase only fills the `L` slot and threads `quoteConditions`/`seedTables` through `priceQuote`. `L` freezes onto `line_items.breakdown` at pricing time and recomputes only on explicit reprice.

**Tech Stack:** TypeScript strict, Next.js 16 App Router, Supabase, Zod 4, Vitest.

## Global Constraints

(Inherited from `2026-07-04-accuracy-program-roadmap.md`. Every task obeys these.)

- **`L` is fixed-point** (`lMicro = round(L × 1e6)`, a bigint ≥ `1_000_000n`). `productivity / L` is invalid BigInt math — always use the roadmap §7.2 single division. Compose multiple factors as a rational `L_num/L_den` at full precision; **one** rounding event.
- **`evaluateCostModel` signature is already `{ burdenNum, L }`** (Phase B, roadmap §7.1). This phase does NOT change it — it passes `opts.L`.
- **MCAA percentages are additive** (sum, don't compound), **cap 5 factors**, **severe requires `severeConfirmed`**. **MCAA and NECA are mutually exclusive** baseline modes (`condition_mode`). Per-line `L_line` stacks only on axes the baseline doesn't cover.
- **Freeze by default:** the composed `L` + breakdown snapshot onto `line_items.breakdown` at price time; a seed-table edit never moves an existing quote's `L`. Recompute only on explicit `reprice`. A manual correction sets `breakdown.manualOverride = true`.
- **Seed tables follow roadmap §7.3 UI-table convention.** One migration, sorts last.
- Shift/OT **wage** premium is a Phase-B price uplift, kept separate from the **productivity** loss here.
- TDD per task; commit after every task.

## Existing Interfaces This Phase Consumes (verbatim, do not redefine)

```ts
// src/lib/domain/cost-engine.ts (from Phase B)
export function evaluateCostModel(model, snapshot, opts?: { burdenNum?: bigint; L?: bigint }): RateBreakdown;
export const L_MICRO = 1_000_000n;   // labor = roundDivHalfUp(price*(100+burdenNum)*MICRO*L_num, productivity*100*L_den)

// src/lib/domain/money.ts
function roundDivHalfUp(n: bigint, d: bigint): bigint;   // n>=0, d>0
function parseDecimalToMicro(s: string): bigint;

// src/lib/domain/price-quote.ts
interface MatchedItem { id; sectionRef; itemType; unitCanonical; quantityThousandths; givenAmountFils?; match; }
function priceQuote(input: { items: MatchedItem[]; skills; snapshot; overrides?; ratioChecks? }): { lines; rollup; projectFlags };

// src/lib/domain/types.ts
interface RateBreakdown { materialFils; wasteFils; laborFils; equipmentFils; markupFils; rateFils; priceEntryIds; }

// src/lib/pipeline/assemble.ts   assembleAndPrice(input) — has overrides? (Phase A/B)
// src/lib/db/client.ts           serviceClient()
```

## Interfaces This Phase Produces (later tasks/phases rely on these — exact names/types)

```ts
// src/lib/domain/productivity.ts
export interface McaaSelection { key: string; severity: "minor" | "average" | "severe"; severeConfirmed?: boolean; }
export interface QuoteConditions {
  mode: "mcaa" | "neca";
  mcaa?: McaaSelection[];
  neca?: { scores: Record<string, 1 | 2 | 3> };
  overtime?: { hrs: number; weeks: number };
  shift?: "day" | "second_night" | "third";
}
export interface LineConditions { heightBand?: string; floorBand?: string; exposure?: string; }
export interface ConditionSeedTables {
  mcaa: Record<string, { minor: number; average: number; severe: number }>;
  neca: string[];                                  // 30 row keys, uniform weight
  overtimePi: Record<string, number>;              // `${hrs}:${weeks}` -> index (0..1)
  heightBands: Array<{ minFt: number; maxFt: number | null; upliftPct: number }>;
  floorBands: Array<{ minFloors: number; maxFloors: number; upliftPct: number }>;
  weatherBands: Record<string, number>;            // exposure -> uplift %
  shiftBands: Record<string, number>;              // shift_type -> uplift %
}
export interface LossResult { lMicro: bigint; breakdown: { productivityLoss: number; sources: Record<string, number> }; }
export const MAX_MCAA_FACTORS = 5;
export class TooManyMcaaFactors extends Error {}
export class UnconfirmedSevere extends Error {}
export function computeLossMultiplier(q: QuoteConditions, line: LineConditions | null, seed: ConditionSeedTables): LossResult;

// src/lib/db/conditions.ts
export function getConditionSeedTables(db?): Promise<ConditionSeedTables>;

// src/lib/domain/types.ts (RateBreakdown extended — optional)
//   productivityLoss?: number; sources?: Record<string, number>; manualOverride?: boolean;
```

## File Map (target state)

```
supabase/migrations/
  <ts>_phase_c_conditions.sql   # 7 seed tables + seed rows; quotes.condition_mode/condition_input; line_items.line_conditions
src/lib/
  domain/
    productivity.ts   # computeLossMultiplier + guardrails + types
    types.ts          # RateBreakdown + productivityLoss?/sources?/manualOverride?
    price-quote.ts    # thread quoteConditions/seedTables/lineConditions; compute L per line
  db/
    conditions.ts     # getConditionSeedTables
  pipeline/
    assemble.ts       # forward quoteConditions/seedTables
  app/(app)/quotes/[id]/
    ConditionsForm.tsx  # MCAA tab | NECA tab; per-line override editor
tests/domain/
  productivity-mcaa.test.ts, productivity-neca.test.ts, productivity-compose.test.ts,
  productivity-guards.test.ts, cost-engine-L.test.ts
```

---

### Task 1: Migration — 7 condition seed tables + quote/line columns

**Files:**
- Create: `supabase/migrations/<ts>_phase_c_conditions.sql`

**Interfaces:**
- Produces: `mcaa_factors`, `neca_conditions`, `overtime_pi`, `height_bands`, `floor_bands`, `weather_bands`, `shift_bands` (seeded); `quotes.condition_mode`/`condition_input`; `line_items.line_conditions`.

- [ ] **Step 1: Create the migration**

```bash
npx supabase migration new phase_c_conditions
# ls supabase/migrations | tail  — confirm sorts LAST (roadmap §7.4)
```

- [ ] **Step 2: Write the SQL** (spec §4/§6 seed values verbatim)

```sql
create table mcaa_factors (key text primary key, label_ar text not null, minor_pct int not null, avg_pct int not null, severe_pct int not null);
insert into mcaa_factors values
 ('stacking_of_trades','تداخل المهن',10,20,30),('morale','الروح المعنوية',5,15,30),
 ('reassignment','إعادة توزيع العمالة',5,10,15),('crew_size','حجم الطاقم',10,20,30),
 ('concurrent_ops','عمليات متزامنة',5,15,25),('dilution_supervision','تخفيف الإشراف',10,15,25),
 ('learning_curve','منحنى التعلّم',5,15,30),('errors_omissions','أخطاء وسهو',1,3,6),
 ('beneficial_occupancy','إشغال جزئي',15,25,40),('joint_occupancy','إشغال مشترك',5,12,20),
 ('site_access','الوصول للموقع',5,12,30),('logistics','اللوجستيات',10,25,50),
 ('fatigue','الإرهاق',8,10,12),('ripple','التأثير المتسلسل',10,15,20),
 ('overtime','العمل الإضافي',10,15,20),('season_weather','الموسم/الطقس',10,20,30) on conflict do nothing;

create table neca_conditions (key text primary key, label_ar text not null);
insert into neca_conditions (key, label_ar) values
 ('hours_worked','ساعات العمل'),('shift','الوردية'),('job_documents','وثائق العمل'),('working_conditions','ظروف العمل'),
 ('crew_density','كثافة الطاقم'),('working_height','ارتفاع العمل'),('floors','الطوابق'),('building_sqft','مساحة المبنى'),
 ('project_size','حجم المشروع'),('site_size','حجم الموقع'),('safety','السلامة'),('occupancy','الإشغال'),
 ('cleanliness','النظافة'),('repetition','التكرار'),('systems_complexity','تعقيد الأنظمة'),('access','الوصول'),
 ('tools','الأدوات'),('coordination','التنسيق'),('labor_availability','توفّر العمالة'),('info_flow','تدفق المعلومات'),
 ('decision_making','اتخاذ القرار'),('continuity','الاستمرارية'),('change_orders','أوامر التغيير'),
 ('schedule_compression','ضغط الجدول'),('meetings','الاجتماعات'),('material_handling','مناولة المواد'),
 ('storage','التخزين'),('utilities_temp','المرافق المؤقتة'),('inspection_regime','نظام التفتيش'),('weather_exposure','التعرض للطقس')
 on conflict do nothing;   -- exactly 30 rows

create table overtime_pi (hours_per_week int, week_number int, index_value numeric not null, primary key(hours_per_week, week_number));
insert into overtime_pi values (50,1,0.95),(50,10,0.72),(60,1,0.91),(60,10,0.61) on conflict do nothing;

create table height_bands (min_ft int primary key, max_ft int, uplift_pct int not null);
insert into height_bands values (0,10,0),(10,20,25),(20,null,50) on conflict do nothing;

create table floor_bands (min_floors int primary key, max_floors int not null, uplift_pct int not null);
insert into floor_bands values (1,2,0),(3,6,1),(7,10,4),(11,15,8),(16,19,10),(20,30,13) on conflict do nothing;

create table weather_bands (exposure text primary key, uplift_pct int not null);
insert into weather_bands values ('indoor_controlled',0),('outdoor_temperate',25),('outdoor_hot',50) on conflict do nothing;

create table shift_bands (shift_type text primary key, uplift_pct int not null);
insert into shift_bands values ('day',0),('second_night',13),('third',18) on conflict do nothing;

alter table quotes
  add column condition_mode text check (condition_mode in ('mcaa','neca')) default 'mcaa',
  add column condition_input jsonb;
alter table line_items add column line_conditions jsonb;

-- UI-table convention (roadmap §7.3) for the 7 seed tables
do $$
declare t text;
begin
  foreach t in array array['mcaa_factors','neca_conditions','overtime_pi','height_bands','floor_bands','weather_bands','shift_bands'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format($f$create policy %I on %I for select to authenticated using (true)$f$, t||'_sel', t);
    execute format($f$create policy %I on %I for insert to authenticated with check (true)$f$, t||'_ins', t);
    execute format($f$create policy %I on %I for update to authenticated using (true) with check (true)$f$, t||'_upd', t);
    execute format($f$create policy %I on %I for delete to authenticated using (true)$f$, t||'_del', t);
  end loop;
end $$;
```

- [ ] **Step 3: Push + verify** — `npx supabase db push`; confirm `select count(*) from neca_conditions` returns **30**.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): phase-C condition seed tables (MCAA/NECA/OT/height/floor/weather/shift)"
```

---

### Task 2: `computeLossMultiplier` — MCAA mode + guardrails

**Files:**
- Create: `src/lib/domain/productivity.ts`
- Test: `tests/domain/productivity-mcaa.test.ts`, `tests/domain/productivity-guards.test.ts`

**Interfaces:**
- Consumes: `ConditionSeedTables` (types below).
- Produces: `computeLossMultiplier` (MCAA branch), `MAX_MCAA_FACTORS`, `TooManyMcaaFactors`, `UnconfirmedSevere`, and all the exported types.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/domain/productivity-mcaa.test.ts
import { describe, it, expect } from "vitest";
import { computeLossMultiplier } from "@/lib/domain/productivity";

const seed = {
  mcaa: { logistics: { minor: 10, average: 25, severe: 50 }, stacking_of_trades: { minor: 10, average: 20, severe: 30 } },
  neca: [], overtimePi: {}, heightBands: [{ minFt: 0, maxFt: 10, upliftPct: 0 }, { minFt: 10, maxFt: 20, upliftPct: 25 }],
  floorBands: [], weatherBands: {}, shiftBands: {},
} as any;

it("sums MCAA factors additively into L (not compounded)", () => {
  const r = computeLossMultiplier({ mode: "mcaa", mcaa: [{ key: "logistics", severity: "average" }, { key: "stacking_of_trades", severity: "minor" }] }, null, seed);
  // 25% + 10% = 35% -> L = 1.35 -> lMicro 1_350_000
  expect(r.lMicro).toBe(1_350_000n);
  expect(r.breakdown.productivityLoss).toBe(1.35);
});
```

```ts
// tests/domain/productivity-guards.test.ts
import { computeLossMultiplier, TooManyMcaaFactors, UnconfirmedSevere } from "@/lib/domain/productivity";
const seed = { mcaa: Object.fromEntries(["a","b","c","d","e","f"].map((k) => [k, { minor: 5, average: 10, severe: 20 }])), neca: [], overtimePi: {}, heightBands: [], floorBands: [], weatherBands: {}, shiftBands: {} } as any;
it("throws on more than 5 MCAA factors", () => {
  const six = ["a","b","c","d","e","f"].map((key) => ({ key, severity: "minor" as const }));
  expect(() => computeLossMultiplier({ mode: "mcaa", mcaa: six }, null, seed)).toThrow(TooManyMcaaFactors);
});
it("throws on unconfirmed severe", () => {
  expect(() => computeLossMultiplier({ mode: "mcaa", mcaa: [{ key: "a", severity: "severe" }] }, null, seed)).toThrow(UnconfirmedSevere);
});
it("computes when severe is confirmed", () => {
  const r = computeLossMultiplier({ mode: "mcaa", mcaa: [{ key: "a", severity: "severe", severeConfirmed: true }] }, null, seed);
  expect(r.lMicro).toBe(1_200_000n);   // 20%
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/domain/productivity-mcaa.test.ts tests/domain/productivity-guards.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the MCAA branch + guards**

```ts
// src/lib/domain/productivity.ts  (types from the Interfaces-Produced block, then:)
export const MAX_MCAA_FACTORS = 5;
export class TooManyMcaaFactors extends Error {}
export class UnconfirmedSevere extends Error {}
const L_MICRO = 1_000_000n;

// factor value as a 1e6-scaled bigint for full-precision compose
function factorMicro(upliftPct: number): bigint { return L_MICRO + BigInt(upliftPct) * 10_000n; } // 1 + pct/100

export function computeLossMultiplier(q: QuoteConditions, line: LineConditions | null, seed: ConditionSeedTables): LossResult {
  const sources: Record<string, number> = {};
  let baselinePct = 0;   // additive percent for MCAA
  if (q.mode === "mcaa") {
    const sel = q.mcaa ?? [];
    if (sel.length > MAX_MCAA_FACTORS) throw new TooManyMcaaFactors(`>${MAX_MCAA_FACTORS} MCAA factors`);
    for (const s of sel) {
      if (s.severity === "severe" && s.severeConfirmed !== true) throw new UnconfirmedSevere(s.key);
      const row = seed.mcaa[s.key];
      if (!row) continue;
      const pct = s.severity === "minor" ? row.minor : s.severity === "average" ? row.average : row.severe;
      baselinePct += pct;
      sources[`mcaa:${s.key}`] = pct;
    }
  } else {
    // NECA branch — Task 3
    return computeNeca(q, line, seed, sources);
  }
  // baseline as a 1e6-scaled factor
  const factors: bigint[] = [factorMicro(baselinePct)];
  // per-line L_line (Task 4) appended here
  return compose(factors, sources);
}

// full-precision rational compose: L_num = Π f_i, L_den = L_MICRO^(count-1); ONE rounding at the division (in cost-engine)
function compose(factors: bigint[], sources: Record<string, number>): LossResult {
  let num = 1n, den = 1n;
  for (const f of factors) { num *= f; den *= L_MICRO; }
  // reduce to a single lMicro for storage/breakdown (round once here for the persisted display value)
  const lMicro = roundDivHalfUp(num * L_MICRO, den);   // import roundDivHalfUp
  return { lMicro, breakdown: { productivityLoss: Number(lMicro) / 1e6, sources } };
}
```

> Note on rounding: the engine (Phase B §7.2) applies `L_num/L_den` inside its single division, so pricing never rounds `L` first. The `lMicro` returned here is the **display/persistence** value (rounded once) — `cost-engine` receives it as `opts.L`. For at-most-two factors the difference is sub-fils; the `compose` returns both a reduced `lMicro` (for `opts.L`) and, if you want bit-exact multi-factor pricing, expose `{ num, den }` too. **Decision:** since Mode A/B are mutually exclusive and per-line adds at most one more factor, at most two factors compose — pass the reduced `lMicro` to `opts.L`. The Task 5 test locks the fils result.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/domain/productivity-mcaa.test.ts tests/domain/productivity-guards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/productivity.ts tests/domain/productivity-mcaa.test.ts tests/domain/productivity-guards.test.ts
git commit -m "feat(domain): computeLossMultiplier MCAA branch + guardrails"
```

---

### Task 3: NECA branch + banding

**Files:**
- Modify: `src/lib/domain/productivity.ts` (`computeNeca`)
- Test: `tests/domain/productivity-neca.test.ts`

**Interfaces:**
- Produces: `computeNeca` — sums 30 scores (1/2/3), bands to L=1.00 / 1.25 / 1.50.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/productivity-neca.test.ts
import { computeLossMultiplier } from "@/lib/domain/productivity";
const seed = { mcaa: {}, neca: Array.from({ length: 30 }, (_, i) => `r${i}`), overtimePi: {}, heightBands: [], floorBands: [], weatherBands: {}, shiftBands: {} } as any;
const allScored = (v: 1|2|3) => Object.fromEntries(seed.neca.map((k: string) => [k, v]));

it("bands the NECA total: all-1 -> Normal L=1.00", () => {
  const r = computeLossMultiplier({ mode: "neca", neca: { scores: allScored(1) } }, null, seed);
  expect(r.lMicro).toBe(1_000_000n);   // total 30 -> Normal
});
it("all-2 (total 60) -> Difficult L=1.25", () => {
  const r = computeLossMultiplier({ mode: "neca", neca: { scores: allScored(2) } }, null, seed);
  expect(r.lMicro).toBe(1_250_000n);
});
it("all-3 (total 90) -> Very Difficult L=1.50", () => {
  const r = computeLossMultiplier({ mode: "neca", neca: { scores: allScored(3) } }, null, seed);
  expect(r.lMicro).toBe(1_500_000n);
});
```

- [ ] **Step 2–4:** Implement `computeNeca`: `total = Σ scores` (missing key defaults to 1); band `30–40 → 1_000_000n`, `41–70 → 1_250_000n`, `71–90 → 1_500_000n`; set `sources["neca:band"]`; then append per-line factors via `compose`. Run → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/productivity.ts tests/domain/productivity-neca.test.ts
git commit -m "feat(domain): computeLossMultiplier NECA branch + banding"
```

---

### Task 4: Per-line `L_line` (height/floor/exposure) + de-dup vs baseline

**Files:**
- Modify: `src/lib/domain/productivity.ts`
- Test: `tests/domain/productivity-compose.test.ts`

**Interfaces:**
- Produces: per-line height/floor/exposure factors appended to the compose; under NECA mode a per-line height override zeroes `working_height`+`floors` NECA rows and a per-line exposure override zeroes `working_conditions` (spec §3).

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/productivity-compose.test.ts
import { computeLossMultiplier } from "@/lib/domain/productivity";
const seed = {
  mcaa: { logistics: { minor: 10, average: 25, severe: 50 } },
  neca: [], overtimePi: {},
  heightBands: [{ minFt: 0, maxFt: 10, upliftPct: 0 }, { minFt: 10, maxFt: 20, upliftPct: 25 }, { minFt: 20, maxFt: null, upliftPct: 50 }],
  floorBands: [{ minFloors: 3, maxFloors: 6, upliftPct: 1 }],
  weatherBands: { outdoor_hot: 50 }, shiftBands: {},
} as any;

it("stacks L_line on the MCAA baseline (baseline × line)", () => {
  // baseline 25% (logistics avg) -> 1.25 ; line height 10-20ft -> +25% -> 1.25 ; combined 1.25*1.25 = 1.5625
  const r = computeLossMultiplier({ mode: "mcaa", mcaa: [{ key: "logistics", severity: "average" }] }, { heightBand: "10-20" }, seed);
  expect(r.lMicro).toBe(1_562_500n);
});
it("height+floor uplift are additive within L_line", () => {
  // height 10-20 (+25) + floor 3-6 (+1) = +26% -> L_line 1.26
  const r = computeLossMultiplier({ mode: "mcaa", mcaa: [] }, { heightBand: "10-20", floorBand: "3-6" }, seed);
  expect(r.lMicro).toBe(1_260_000n);
});
```

- [ ] **Step 2–4:** Implement `L_line`: look up `heightBand`/`floorBand`/`exposure` uplifts (height+floor additive → one `L_line` factor `1 + (h+f)/100`; exposure a separate factor or folded in), append to `factors`. Under NECA mode, before summing, zero the covered rows (`working_height`, `floors` for a height override; `working_conditions` for an exposure override). Run → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/productivity.ts tests/domain/productivity-compose.test.ts
git commit -m "feat(domain): per-line L_line (height/floor/exposure) + NECA de-dup"
```

---

### Task 5: `cost-engine` L application (fils-exact lock)

**Files:**
- Test: `tests/domain/cost-engine-L.test.ts`
- (No source change — Phase B already added `opts.L`; this task LOCKS the L path with a fils-exact test.)

**Interfaces:**
- Consumes: `evaluateCostModel(model, snapshot, { L })`.
- Produces: a regression lock that `L` scales labor by exactly `L`, one rounding, and composes with burden.

- [ ] **Step 1: Write the test**

```ts
// tests/domain/cost-engine-L.test.ts
import { evaluateCostModel } from "@/lib/domain/cost-engine";
// same tiling model (labor 25000/day, productivity 15)
it("L=1.20 slows labor by 20%, one rounding", () => {
  const b = evaluateCostModel(tiling, snapshot, { L: 1_200_000n });
  // 25000 * 100 * 1e6 * 1.2e6 / (15e6 * 100 * 1e6) = 25000*1.2/15 = 2000
  expect(b.laborFils).toBe(2000);
});
it("burden 30% AND L 1.20 compose in one division", () => {
  const b = evaluateCostModel(tiling, snapshot, { burdenNum: 30n, L: 1_200_000n });
  // 25000 * 130 * 1e6 * 1.2e6 / (15e6*100*1e6) = 25000*130*1.2/(15*100) = 2600
  expect(b.laborFils).toBe(2600);
});
it("L=1.0 is the identity (laborFils 1667)", () => {
  expect(evaluateCostModel(tiling, snapshot, { L: 1_000_000n }).laborFils).toBe(1667);
});
```

- [ ] **Step 2: Run** — Run: `npx vitest run tests/domain/cost-engine-L.test.ts` — Expected: PASS (Phase B's engine already handles `L`). If any case fails, the Phase-B division form is wrong — fix `cost-engine.ts` there, not here.

- [ ] **Step 3: Commit**

```bash
git add tests/domain/cost-engine-L.test.ts
git commit -m "test(domain): fils-exact lock for L (and burden×L composition)"
```

---

### Task 6: `db/conditions.ts` — load seed tables

**Files:**
- Create: `src/lib/db/conditions.ts`
- Test: `tests/db/conditions.test.ts` (integration)

**Interfaces:**
- Produces: `getConditionSeedTables(db?): Promise<ConditionSeedTables>` — reads all 7 tables into the in-memory shape `computeLossMultiplier` expects.

- [ ] **Step 1: Failing test**

```ts
// tests/db/conditions.test.ts
import { getConditionSeedTables } from "@/lib/db/conditions";
it("loads all seed tables with 30 NECA rows and the MCAA table", async () => {
  const s = await getConditionSeedTables();
  expect(s.neca.length).toBe(30);
  expect(s.mcaa.logistics.average).toBe(25);
  expect(s.shiftBands.third).toBe(18);
});
```

- [ ] **Step 2–4:** Implement — one `select *` per table, shape into `ConditionSeedTables`. Run → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/conditions.ts tests/db/conditions.test.ts
git commit -m "feat(db): getConditionSeedTables loader"
```

---

### Task 7: Thread `quoteConditions`/`seedTables`/`lineConditions` through `priceQuote`

**Files:**
- Modify: `src/lib/domain/price-quote.ts` (compute L per line, pass `opts.L`, merge breakdown)
- Modify: `src/lib/domain/types.ts` (`RateBreakdown` + `productivityLoss?`/`sources?`/`manualOverride?`)
- Modify: `src/lib/pipeline/assemble.ts` (forward `quoteConditions`/`seedTables`)
- Test: `tests/domain/price-quote-conditions.test.ts`

**Interfaces:**
- Consumes: `computeLossMultiplier`, `ConditionSeedTables`, `QuoteConditions`, `LineConditions`.
- Produces: `priceQuote` input `+ quoteConditions?`, `+ seedTables?`; `MatchedItem` `+ lineConditions?`; each priced line's `breakdown` carries `productivityLoss`/`sources` when L≠1.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/price-quote-conditions.test.ts
// Build one matched labor line; price it with quoteConditions {mode:'mcaa', mcaa:[{key:'logistics',severity:'average'}]} + seedTables.
// Assert the priced line's rateFils reflects L=1.25 on labor AND breakdown.productivityLoss === 1.25.
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/domain/price-quote-conditions.test.ts` — FAIL (params not accepted).

- [ ] **Step 3: Extend types + `RateBreakdown`**

```ts
// types.ts RateBreakdown: add
productivityLoss?: number; sources?: Record<string, number>; manualOverride?: boolean;
```

- [ ] **Step 4: Thread through `priceQuote`** — add `quoteConditions?: QuoteConditions; seedTables?: ConditionSeedTables` to the input; add `lineConditions?: LineConditions` to `MatchedItem`. In the per-line map, before `evaluateCostModel`:

```ts
const { lMicro, breakdown: loss } = (input.quoteConditions && input.seedTables)
  ? computeLossMultiplier(input.quoteConditions, item.lineConditions ?? null, input.seedTables)
  : { lMicro: 1_000_000n, breakdown: undefined };
const rate = evaluateCostModel(model, snapshot, { burdenNum, L: lMicro });
// merge loss (productivityLoss + sources) into the line's breakdown before returning
```

Forward `quoteConditions`/`seedTables` from `assembleAndPrice` into `priceQuote`.

- [ ] **Step 5: Run to verify it passes** — `npx vitest run tests/domain/price-quote-conditions.test.ts && npx vitest run tests/domain` — PASS (no regression).

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/price-quote.ts src/lib/domain/types.ts src/lib/pipeline/assemble.ts tests/domain/price-quote-conditions.test.ts
git commit -m "feat(domain): thread conditions through priceQuote; L per line + breakdown sources"
```

---

### Task 8: Freeze/recompute + manual-override on correction

**Files:**
- Modify: the reprice path (`src/lib/domain/reprice-core.ts` from Phase B) to recompute `L` from `condition_input` + current seed tables
- Modify: `src/app/(app)/quotes/[id]/core.ts` (`applyCorrectionCore`) to set `breakdown.manualOverride = true`
- Test: `tests/domain/l-freeze.test.ts`

**Interfaces:**
- Produces: L freezes onto `line_items.breakdown` at pricing; recompute only via `reprice`; a manual correction marks `manualOverride`.

- [ ] **Step 1: Write the test** — `applyCorrectionCore` with a new rate sets `breakdown.manualOverride === true` and leaves `condition_input` untouched; `repriceCore` recomputes `L` from the passed `quoteConditions`+`seedTables`.

- [ ] **Step 2–4:** Implement: `reprice(quoteId)` (Phase B) now also loads `quote.condition_input` → `QuoteConditions` and `getConditionSeedTables(db)`, passing both into `repriceCore`; `applyCorrectionCore` sets `manualOverride`. Run → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/reprice-core.ts "src/app/(app)/quotes/[id]/core.ts" tests/domain/l-freeze.test.ts
git commit -m "feat(domain): L freeze on price, recompute on reprice, manualOverride on correction"
```

---

### Task 9: Conditions capture UI (MCAA tab | NECA tab + per-line override)

**Files:**
- Create: `src/app/(app)/quotes/[id]/ConditionsForm.tsx`
- Modify: the quote-detail page + `ProjectSettingsForm` (Phase B) to host the conditions tabs; the line editor to host per-line height/floor/exposure

**Interfaces:**
- Consumes: `getConditionSeedTables`, `reprice`.
- Produces: a two-tab baseline picker (MCAA checklist with severity + severe-confirm; NECA 30-row scorer) writing `condition_mode`+`condition_input`; per-line dropdowns writing `line_conditions`; both trigger `reprice`.

- [ ] **Step 1: Build the MCAA tab** — checklist of the 16 factors, severity per factor (minor/average; severe shows a confirm checkbox), live sum + resulting `L`, hard cap 5 (disable further ticks). Write `{ mode:'mcaa', mcaa:[...] }` to `condition_input`.

- [ ] **Step 2: Build the NECA tab** — the 30 rows each a 1/2/3 selector, live total + band + `L`. Write `{ mode:'neca', neca:{ scores } }`.

- [ ] **Step 3: Per-line override** — on the line editor, height-band + floor-band + exposure dropdowns writing `line_conditions`. On any save → `await reprice(quoteId)`.

- [ ] **Step 4: "Why did this rate move?"** — render `breakdown.sources` (e.g. "MCAA logistics +25%, height +25%") on hover/expand of a line whose `productivityLoss > 1`.

- [ ] **Step 5: Preview-verify** — start the dev server, add a factor, confirm labor-heavy line rates rise and the sources show. (Previewable.)

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/quotes/[id]/ConditionsForm.tsx" "src/app/(app)/quotes/[id]/page.tsx"
git commit -m "feat(ui): MCAA/NECA conditions capture + per-line overrides + rate-move explainer"
```

---

### Task 10: Phase-A gate run for the productivity layer

**Files:** (verification task — evidence only.)

- [ ] **Step 1:** Add a `--conditions <json>` flag to `scripts/backtest.ts` that injects `quoteConditions` + loads `getConditionSeedTables` into the run.
- [ ] **Step 2:** Run the scored cases with representative conditions (`--label with-mcaa`), then `--compare baseline with-mcaa`.
- [ ] **Step 3:** Record the per-project-type verdict. The productivity layer must not regress grand-total deviation and should improve ≥1 segment; if it helps MEP but not civil, note it ships type-scoped.
- [ ] **Step 4:** Commit the recorded result.

```bash
git commit --allow-empty -m "test(backtest): phase-C productivity-layer gate results recorded"
```

---

## Self-Review (completed against the spec)

- **Spec coverage:** §4 seed tables → Task 1; §2/§3 fixed-point L + composition + guardrails → Tasks 2–5; §6 threading → Task 7; §6.1 freeze/recompute → Task 8; capture UX → Task 9; gate → Task 10. MCAA/NECA mutual exclusivity and per-line de-dup are in Tasks 2–4.
- **Type consistency:** `computeLossMultiplier(q, line, seed): LossResult` identical across Tasks 2/3/4/7; `ConditionSeedTables` identical in Tasks 2/6/7; `evaluateCostModel(model, snapshot, {burdenNum, L})` matches Phase B exactly (Task 5 only tests it).
- **Cross-phase:** relies on Phase B's `opts.L` slot (unchanged here) and Phase B's `reprice`/`repriceCore` seam (Task 8 extends it). Produces `line_items.line_conditions` + `condition_input` that Phase D's variance loop reads as condition tags.
- **No placeholders:** every math test carries its hand-computed L and fils (1.35→1_350_000n; L=1.2→laborFils 2000; burden30+L1.2→2600). The compose rounding caveat is called out explicitly with the at-most-two-factors justification.
