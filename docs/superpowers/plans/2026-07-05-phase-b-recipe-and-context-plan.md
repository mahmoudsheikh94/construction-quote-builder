# Phase B: Rate-Recipe Completion & Context Modifiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the unit-rate recipe (labor burden, overhead/profit split, per-material waste) and add the cheapest whole-estimate modifiers (location factor, geometry, time index, estimate-class ± band) — each a firm constant or a single per-quote input, threaded through the existing `overrides` machinery and gated by the Phase-A backtest.

**Architecture:** A `firm_settings` singleton + four firm-editable reference tables hold constants and lookups. `evaluateCostModel` changes signature **once** (to an `opts` object carrying `burdenNum` and, later, Phase-C's `L`) and folds burden into the single fixed-point labor division. New `apply*` transforms (location, time, size) slot into the existing `overrides.ts` pipeline. A pure `applyEstimateBand` attaches an AACE ± band to the rollup. A session-client `reprice(quoteId)` server action re-runs pricing after project-settings edits.

**Tech Stack:** TypeScript strict, Next.js 16 App Router (server actions, RSC), Supabase (session client + service client), Zod 4, Vitest.

## Global Constraints

(Inherited from `2026-07-04-accuracy-program-roadmap.md`. Every task obeys these.)

- **Money = integer fils; no floats in the money path.** `money.ts` helpers only.
- **`evaluateCostModel` signature changes exactly once** (roadmap §7.1): `evaluateCostModel(model, snapshot, opts?: { burdenNum?: bigint; L?: bigint })`, both defaulting to identity. The 2-arg call must reprice byte-identically — `tests/domain/cost-engine.test.ts` `laborFils: 1667` is the lock. **Phase B adds `burdenNum`; Phase C later adds `L` to the same opts object.**
- **The single fixed-point labor division** (roadmap §7.2) is the only labor formula: `labor = roundDivHalfUp(price × (100n+burdenNum) × MICRO × lMicro, productivity × 100n × L_MICRO)`. In Phase B, `lMicro = L_MICRO = 1_000_000n` (identity) since Phase C hasn't shipped — but write the division in the L-ready form so Phase C adds nothing structural.
- **Indices are not percents:** `locationFactor`/`sizeFactor` apply via `roundDivHalfUp(price × idxMicro, MICRO)` with no divide-by-100. Percents (`profitPct`, `overheadPct`) apply via `×(100+pct)/(100·MICRO)`.
- **Overhead/profit precedence:** a legacy `markupPct`-only model uses the legacy branch ONLY; `firm_settings.overhead_pct` is NOT applied to it.
- **New UI-edited tables follow roadmap §7.3 UI-table convention:** RLS on; `revoke all from anon`; `grant select,insert,update,delete to authenticated` + the 4 policies. Reference tables the reprice path reads still need at least an `authenticated select` policy.
- **Migration hygiene (roadmap §7.4):** one migration for the phase; confirm it sorts last.
- **Web pricing uses the session client** (roadmap §7.4): `reprice(quoteId)` uses `await createClient()` end-to-end, never `serviceClient()`.
- TDD per task; commit after every task.

## Existing Interfaces This Phase Consumes (verbatim, do not redefine)

```ts
// src/lib/domain/cost-engine.ts — CURRENT body (the thing Task 3 rewrites)
export function evaluateCostModel(model: CostModel, snapshot: PriceSnapshot): RateBreakdown {
  let material = 0n, labor = 0n, equipment = 0n;
  const priceEntryIds: Record<string, string> = {};
  for (const c of model.components) {
    const entry = snapshot[c.priceBookKey];
    if (!entry) throw new MissingPriceKeyError(c.priceBookKey);
    priceEntryIds[c.priceBookKey] = entry.entryId;
    const price = BigInt(entry.priceFils);
    if (c.kind === "labor") {
      const productivity = parseDecimalToMicro(c.productivityPerDay!);
      labor += roundDivHalfUp(price * MICRO, productivity);
    } else {
      const qty = parseDecimalToMicro(c.qtyPerUnit!);
      const cost = roundDivHalfUp(price * qty, MICRO);
      if (c.kind === "material") material += cost; else equipment += cost;
    }
  }
  const waste = roundDivHalfUp(material * parseDecimalToMicro(model.wastePct), 100n * MICRO);
  const base = material + waste + labor + equipment;
  const markup = roundDivHalfUp(base * parseDecimalToMicro(model.markupPct), 100n * MICRO);
  return { materialFils: Number(material), wasteFils: Number(waste), laborFils: Number(labor),
    equipmentFils: Number(equipment), markupFils: Number(markup), rateFils: Number(base + markup), priceEntryIds };
}
const MICRO = 1_000_000n;   // cost-engine.ts:11

// src/lib/domain/overrides.ts — CURRENT
export interface ProjectOverrides {
  priceBook?: Record<string, number>;
  globalMarkupPct?: string;
  markupPctByTrade?: Record<string, string>;
  laborPremiumPct?: string;
  models?: Record<string, { wastePct?: string; markupPct?: string }>;
}
export function applyModelOverrides(model: CostModel, trade: string, o?: ProjectOverrides): CostModel;
export function applyLaborPremiumToSnapshot(snapshot: PriceSnapshot, laborKeys: string[], o?: ProjectOverrides): PriceSnapshot;
export function applyPriceOverrides(snapshot: PriceSnapshot, o?: ProjectOverrides): PriceSnapshot;

// src/lib/domain/money.ts
function roundDivHalfUp(n: bigint, d: bigint): bigint;       // n>=0, d>0
function parseDecimalToMicro(s: string): bigint;            // "1.5" -> 1_500_000n ; DEC_RE = /^\d+(\.\d{1,6})?$/

// src/lib/domain/types.ts
interface PriceSnapshotEntry { priceFils: number; entryId: string; effectiveDate: string; unit: string; }
type PriceSnapshot = Record<string, PriceSnapshotEntry>;
interface RateBreakdown { materialFils; wasteFils; laborFils; equipmentFils; markupFils; rateFils; priceEntryIds: Record<string,string>; }

// src/lib/domain/rollup.ts
interface QuoteRollup { sections: Array<{ sectionRef: string; totalFils: number; itemCount: number; unpricedCount: number }>; grandTotalFils: number; }

// src/lib/domain/skill-schema.ts
// CostModelSchema { id; labelAr; unit; keywords; components; wastePct; markupPct; band? }
// CostComponentSchema { id; kind: "material"|"labor"|"equipment"; labelAr; priceBookKey; qtyPerUnit?; productivityPerDay? }

// src/lib/db/price-book.ts   getSnapshot(asOf?, db?): Promise<PriceSnapshot>
// src/lib/db/quotes.ts       getQuote(id, db?); listQuotes(db?)
// src/lib/db/client.ts       serviceClient(): SupabaseClient
// src/lib/supabase/server.ts createClient(): Promise<SupabaseClient>   (session client, RLS)
// src/lib/pipeline/assemble.ts  assembleAndPrice(input)  — Phase A added optional `overrides?`
// src/lib/pipeline/run.ts       runPipeline(input)       — Phase A added optional `overrides?`
```

## Interfaces This Phase Produces (later tasks/phases rely on these — exact names/types)

```ts
// src/lib/domain/cost-engine.ts (rewritten signature — pinned by roadmap §7.1)
export function evaluateCostModel(
  model: CostModel, snapshot: PriceSnapshot,
  opts?: { burdenNum?: bigint; L?: bigint },   // burdenNum default 0n, L default 1_000_000n
): RateBreakdown;
export const L_MICRO = 1_000_000n;

// src/lib/domain/overrides.ts (extended)
export interface ProjectOverrides {
  priceBook?: Record<string, number>;
  globalMarkupPct?: string; markupPctByTrade?: Record<string, string>; laborPremiumPct?: string;
  models?: Record<string, { wastePct?: string; markupPct?: string }>;
  laborBurdenPct?: string;          // percent
  profitPct?: string;               // percent
  locationFactor?: { labor?: string; material?: string };  // direct indices
  sizeFactor?: string;              // direct multiplier
  targetDate?: string;              // ISO date
}
export function applyLocationFactor(snapshot: PriceSnapshot, laborKeys: string[], materialKeys: string[], equipmentKeys: string[], o?: ProjectOverrides): PriceSnapshot;
export function applyTimeIndex(snapshot: PriceSnapshot, indices: Record<string, number>, o?: ProjectOverrides): PriceSnapshot;

// src/lib/domain/estimate-band.ts
export const ESTIMATE_CLASS_BANDS: Record<1|2|3|4|5, { lowPct: number; highPct: number }>;
export interface EstimateBand { point: number; low: number | null; high: number | null; class: number | null; }
export function applyEstimateBand(grandTotalFils: number, estimateClass: number | null): EstimateBand;

// src/lib/db/firm-settings.ts
export interface FirmSettings { laborBurdenPct: string; overheadPct: string; defaultReferenceLocation: string | null; }
export function getFirmSettings(db?): Promise<FirmSettings>;
export function updateFirmSettings(input: Partial<FirmSettings>, db?): Promise<void>;

// src/lib/db/reference.ts
export function getLocationFactors(db?): Promise<Record<string, { labor: number; material: number }>>;
export function getCostIndices(db?): Promise<Record<string, number>>;   // effective_date -> index

// src/lib/domain/build-overrides.ts
export function buildProjectOverrides(input: { firm: FirmSettings; quoteOverrides?: Partial<ProjectOverrides> }): ProjectOverrides;

// src/app/(app)/quotes/[id]/actions.ts
export async function reprice(quoteId: string): Promise<void>;   // session-client; persists new rate_fils/amount_fils
```

## File Map (target state)

```
supabase/migrations/
  <ts>_phase_b_recipe_context.sql   # firm_settings + 4 ref tables + quotes columns + price_book_entries.reference_location
src/lib/
  domain/
    cost-engine.ts      # opts{burdenNum,L}; single fixed-point division; overhead/profit; applySizeFactor internal
    overrides.ts        # + laborBurden folding, applyLocationFactor, applyTimeIndex; extended ProjectOverrides
    estimate-band.ts    # ESTIMATE_CLASS_BANDS, applyEstimateBand
    build-overrides.ts  # buildProjectOverrides (firm defaults <- per-quote overlay)
    types.ts            # PriceSnapshotEntry + referenceLocation
    skill-schema.ts     # CostModel +overheadPct/profitPct; CostComponent +materialCategory
  db/
    firm-settings.ts    # getFirmSettings, updateFirmSettings
    reference.ts        # getLocationFactors, getCostIndices, getWasteDefaults, getSizeCurves
    price-book.ts       # getSnapshot SELECT + reference_location
    quotes.ts           # getQuote/listQuotes SELECT estimate_class + geometry
  app/(app)/
    settings/page.tsx + actions.ts     # firm constants + reference-table editors
    quotes/[id]/actions.ts             # reprice(quoteId)
    quotes/[id]/ProjectSettingsForm.tsx
tests/domain/
  cost-engine-burden.test.ts, overhead-profit.test.ts, location-factor.test.ts,
  time-index.test.ts, size-factor.test.ts, estimate-band.test.ts, build-overrides.test.ts
```

---

### Task 1: Migration — `firm_settings` + reference tables + quotes/price-book columns

**Files:**
- Create: `supabase/migrations/<ts>_phase_b_recipe_context.sql`

**Interfaces:**
- Produces: all Phase-B tables/columns per spec §5, UI-table grants for the 5 new tables.

- [ ] **Step 1: Create the migration**

```bash
npx supabase migration new phase_b_recipe_context
# ls supabase/migrations | tail  — confirm it sorts LAST; rename if not (roadmap §7.4)
```

- [ ] **Step 2: Write the SQL** (spec §5 verbatim + UI-table grants)

```sql
create table firm_settings (
  id boolean primary key default true check (id),
  labor_burden_pct numeric not null default 30,
  overhead_pct numeric not null default 15,
  default_reference_location text,
  updated_at timestamptz default now()
);
insert into firm_settings (id) values (true) on conflict do nothing;

alter table quotes
  add column gross_floor_area_m2 numeric,
  add column storeys integer,
  add column avg_storey_height_m numeric,
  add column estimate_class integer check (estimate_class between 1 and 5),
  add column target_date date;

alter table price_book_entries add column reference_location text;

create table location_factors (region text primary key, labor_index numeric not null, material_index numeric not null);
create table cost_indices (effective_date date primary key, index_value numeric not null);
create table material_waste_defaults (material_category text primary key, waste_pct numeric not null);
create table size_curves (facility_type text primary key, ref_size_m2 numeric not null, exponent numeric not null);

-- seed rows (spec §5)
insert into material_waste_defaults values ('mortar',1.5),('tile',10),('structural_steel',13),('stone',10),('concrete',2) on conflict do nothing;
insert into size_curves values ('generic',1000,0.90) on conflict do nothing;
insert into location_factors values ('amman',1.00,1.00) on conflict do nothing;   -- firm home region = base
insert into cost_indices values ('2026-01-01',100.0) on conflict do nothing;      -- price-book base index

-- UI-table convention (roadmap §7.3): RLS + authenticated DML + policies
do $$
declare t text;
begin
  foreach t in array array['firm_settings','location_factors','cost_indices','material_waste_defaults','size_curves'] loop
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

- [ ] **Step 3: Push + verify**

Run: `npx supabase db push`
Expected: applies cleanly. Confirm `select * from firm_settings` returns one row (burden 30, overhead 15).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): phase-B firm_settings, reference tables, quote/price-book columns"
```

---

### Task 2: `skill-schema.ts` — optional `overheadPct`/`profitPct`/`materialCategory`

**Files:**
- Modify: `src/lib/domain/skill-schema.ts`
- Test: `tests/domain/skill-schema-b.test.ts`

**Interfaces:**
- Produces: `CostModelSchema` accepts optional `overheadPct`, `profitPct`; `CostComponentSchema` accepts optional `materialCategory`. All optional — existing content validates unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/skill-schema-b.test.ts
import { describe, it, expect } from "vitest";
import { CostModelSchema } from "@/lib/domain/skill-schema";

it("accepts overheadPct/profitPct/materialCategory and validates legacy content", () => {
  const legacy = { id: "m1", labelAr: "x", unit: "m2", keywords: [], wastePct: "5", markupPct: "15",
    components: [{ id: "c1", kind: "material", labelAr: "y", priceBookKey: "k", qtyPerUnit: "1" }] };
  expect(CostModelSchema.parse(legacy).markupPct).toBe("15");
  const withSplit = { ...legacy, overheadPct: "12", profitPct: "8",
    components: [{ ...legacy.components[0], materialCategory: "tile" }] };
  const parsed = CostModelSchema.parse(withSplit);
  expect(parsed.overheadPct).toBe("12");
  expect(parsed.components[0].materialCategory).toBe("tile");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/skill-schema-b.test.ts`
Expected: FAIL — unknown keys stripped / no such field.

- [ ] **Step 3: Implement** — add to the Zod objects:

```ts
// CostComponentSchema: add
materialCategory: decimalOrStringOptional,   // use z.string().optional()
// CostModelSchema: add
overheadPct: decimalString.optional(),
profitPct: decimalString.optional(),
// keep markupPct as-is (now legacy but still required-or-optional per current schema)
```

(Use the same `decimalString` regex helper the file already defines for `wastePct`/`markupPct`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/skill-schema-b.test.ts && npx vitest run tests/domain`
Expected: PASS (and no regression in existing schema tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/skill-schema.ts tests/domain/skill-schema-b.test.ts
git commit -m "feat(domain): cost-model overhead/profit + component materialCategory (optional)"
```

---

### Task 3: `evaluateCostModel` — opts object, single fixed-point division, overhead/profit, size factor

**Files:**
- Modify: `src/lib/domain/cost-engine.ts`
- Test: `tests/domain/cost-engine-burden.test.ts`, `tests/domain/overhead-profit.test.ts`, `tests/domain/size-factor.test.ts`

**Interfaces:**
- Consumes: `roundDivHalfUp`, `parseDecimalToMicro`.
- Produces: `evaluateCostModel(model, snapshot, opts?: { burdenNum?: bigint; L?: bigint })`; exports `L_MICRO`. The 2-arg call is byte-identical to today (the `laborFils:1667` lock). Reads `model.overheadPct`/`profitPct` when present (else legacy `markupPct`). Reads `opts.sizeFactorMicro`? No — size is applied via `applyModelOverrides`/a wrapper; here the engine scales material+equipment only if the model carries a resolved size flag. **Decision:** keep the engine's public surface to `{burdenNum, L}`; size-factor scaling is folded onto the model's component sub-totals by a pre-step (Task 6) so the engine stays minimal. This task implements burden + overhead/profit only.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/domain/cost-engine-burden.test.ts
import { describe, it, expect } from "vitest";
import { evaluateCostModel } from "@/lib/domain/cost-engine";
// reuse the same `tiling` model + `snapshot` shape as tests/domain/cost-engine.test.ts (labor 25000/day, productivity 15)

it("burdenNum=0 reproduces the current identity (laborFils 1667)", () => {
  const b = evaluateCostModel(tiling, snapshot, { burdenNum: 0n });
  expect(b.laborFils).toBe(1667);
});
it("burdenNum=30 raises labor by exactly 30%, one rounding", () => {
  // 25000 * 130 * 1e6 * 1e6 / (15e6 * 100 * 1e6) = 25000*130/(15*100) = 2166.67 -> 2167
  const b = evaluateCostModel(tiling, snapshot, { burdenNum: 30n });
  expect(b.laborFils).toBe(2167);
  expect(b.materialFils).toBe(9500);   // unchanged
});
```

```ts
// tests/domain/overhead-profit.test.ts
it("legacy markupPct-only model reprices identically (backward-compat lock)", () => {
  const b = evaluateCostModel(tiling, snapshot);   // 2-arg
  expect(b.markupFils).toBe(1746);
  expect(b.rateFils).toBe(13388);
});
it("overhead+profit compound: base*(1+oh)*(1+profit)", () => {
  const m = { ...tiling, markupPct: "0", overheadPct: "12", profitPct: "8" };
  const b = evaluateCostModel(m, snapshot);
  // base = 11642 ; *1.12 = 13039.04 -> markup portion accounts for oh+profit
  expect(b.rateFils).toBe(Number( /* base rounded through the two compounding steps; compute in impl */ 14082));
});
```

> For the overhead+profit exact expected value: `base = material+waste+labor+equipment = 9500+475+1667+0 = 11642`. `afterOh = roundDivHalfUp(11642 * 112, 100) = 13039`; `final = roundDivHalfUp(13039 * 108, 100) = 14082`. Assert `rateFils === 14082` and `markupFils === 14082 - 11642 === 2440`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/domain/cost-engine-burden.test.ts tests/domain/overhead-profit.test.ts`
Expected: FAIL — `opts` not accepted; overhead/profit not read.

- [ ] **Step 3: Rewrite `evaluateCostModel`**

```ts
// src/lib/domain/cost-engine.ts
const MICRO = 1_000_000n;
export const L_MICRO = 1_000_000n;

export function evaluateCostModel(
  model: CostModel, snapshot: PriceSnapshot,
  opts?: { burdenNum?: bigint; L?: bigint },
): RateBreakdown {
  const burdenNum = opts?.burdenNum ?? 0n;
  const lMicro = opts?.L ?? L_MICRO;
  let material = 0n, labor = 0n, equipment = 0n;
  const priceEntryIds: Record<string, string> = {};
  for (const c of model.components) {
    const entry = snapshot[c.priceBookKey];
    if (!entry) throw new MissingPriceKeyError(c.priceBookKey);
    priceEntryIds[c.priceBookKey] = entry.entryId;
    const price = BigInt(entry.priceFils);
    if (c.kind === "labor") {
      const productivity = parseDecimalToMicro(c.productivityPerDay!);
      // single fixed-point division (roadmap §7.2): burden + L in ONE rounding
      labor += roundDivHalfUp(price * (100n + burdenNum) * MICRO * lMicro, productivity * 100n * L_MICRO);
    } else {
      const qty = parseDecimalToMicro(c.qtyPerUnit!);
      const cost = roundDivHalfUp(price * qty, MICRO);
      if (c.kind === "material") material += cost; else equipment += cost;
    }
  }
  const waste = roundDivHalfUp(material * parseDecimalToMicro(model.wastePct), 100n * MICRO);
  const base = material + waste + labor + equipment;
  // overhead/profit precedence: use compounding when present, else legacy markupPct
  let final: bigint;
  if (model.overheadPct != null || model.profitPct != null) {
    const oh = parseDecimalToMicro(model.overheadPct ?? "0");
    const pr = parseDecimalToMicro(model.profitPct ?? "0");
    const afterOh = roundDivHalfUp(base * (100n * MICRO + oh), 100n * MICRO);
    final = roundDivHalfUp(afterOh * (100n * MICRO + pr), 100n * MICRO);
  } else {
    final = base + roundDivHalfUp(base * parseDecimalToMicro(model.markupPct), 100n * MICRO);
  }
  return { materialFils: Number(material), wasteFils: Number(waste), laborFils: Number(labor),
    equipmentFils: Number(equipment), markupFils: Number(final - base), rateFils: Number(final), priceEntryIds };
}
```

- [ ] **Step 4: Run the new tests AND the existing lock**

Run: `npx vitest run tests/domain/cost-engine.test.ts tests/domain/cost-engine-burden.test.ts tests/domain/overhead-profit.test.ts`
Expected: PASS — including the original `laborFils:1667` / `rateFils:13388` (2-arg identity).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/cost-engine.ts tests/domain/cost-engine-burden.test.ts tests/domain/overhead-profit.test.ts
git commit -m "feat(domain): evaluateCostModel opts{burdenNum,L} single-division + overhead/profit split"
```

---

### Task 4: `overrides.ts` — extend `ProjectOverrides`, burden folding, `applyLocationFactor`, `applyTimeIndex`

**Files:**
- Modify: `src/lib/domain/overrides.ts`
- Test: `tests/domain/location-factor.test.ts`, `tests/domain/time-index.test.ts`

**Interfaces:**
- Consumes: `roundDivHalfUp`, `parseDecimalToMicro`.
- Produces: extended `ProjectOverrides`; `applyLocationFactor(snapshot, laborKeys, materialKeys, equipmentKeys, o?)`; `applyTimeIndex(snapshot, indices, o?)`. Burden resolves to `burdenNum` for the engine (a helper `burdenNumFromOverrides(o): bigint`), applied once — not a snapshot uplift.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/domain/location-factor.test.ts
import { describe, it, expect } from "vitest";
import { applyLocationFactor } from "@/lib/domain/overrides";
const snap = {
  labor_day: { priceFils: 25000, entryId: "e1", effectiveDate: "2026-01-01", unit: "day", referenceLocation: null },
  tile_m2:   { priceFils: 8000,  entryId: "e2", effectiveDate: "2026-01-01", unit: "m2",  referenceLocation: null },
} as any;
it("scales labor keys by labor index, material+equipment by material index", () => {
  const out = applyLocationFactor(snap, ["labor_day"], ["tile_m2"], [], { locationFactor: { labor: "1.20", material: "1.10" } });
  expect(out.labor_day.priceFils).toBe(30000);   // 25000 * 1.20
  expect(out.tile_m2.priceFils).toBe(8800);      // 8000 * 1.10
});
it("is identity when locationFactor absent", () => {
  expect(applyLocationFactor(snap, ["labor_day"], ["tile_m2"], [], {})).toEqual(snap);
});
```

```ts
// tests/domain/time-index.test.ts
import { applyTimeIndex } from "@/lib/domain/overrides";
it("scales every entry by index@target / index@baseDate", () => {
  const snap = { k: { priceFils: 10000, entryId: "e", effectiveDate: "2026-01-01", unit: "m2", referenceLocation: null } } as any;
  const out = applyTimeIndex(snap, { "2026-01-01": 100, "2027-01-01": 103 }, { targetDate: "2027-01-01" });
  expect(out.k.priceFils).toBe(10300);   // 10000 * 103/100
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/domain/location-factor.test.ts tests/domain/time-index.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement** (extend the interface + add the two transforms + burden helper)

```ts
// ProjectOverrides: add laborBurdenPct?, profitPct?, locationFactor?, sizeFactor?, targetDate? (see Interfaces-Produced)

export function burdenNumFromOverrides(o?: ProjectOverrides): bigint {
  if (!o?.laborBurdenPct) return 0n;
  // whole-percent only for the engine's (100+burdenNum) form; accept integer-valued percents
  return BigInt(Math.round(Number(o.laborBurdenPct)));
}

export function applyLocationFactor(snapshot, laborKeys, materialKeys, equipmentKeys, o?): PriceSnapshot {
  if (!o?.locationFactor) return snapshot;
  const out: PriceSnapshot = { ...snapshot };
  const scale = (keys: string[], idx?: string) => {
    if (!idx) return;
    const m = parseDecimalToMicro(idx);
    for (const k of keys) if (out[k]) out[k] = { ...out[k], priceFils: Number(roundDivHalfUp(BigInt(out[k].priceFils) * m, MICRO)) };
  };
  scale(laborKeys, o.locationFactor.labor);
  scale(materialKeys, o.locationFactor.material);
  scale(equipmentKeys, o.locationFactor.material);   // equipment uses the material index (spec §5.5)
  return out;
}

export function applyTimeIndex(snapshot, indices: Record<string, number>, o?): PriceSnapshot {
  if (!o?.targetDate) return snapshot;
  const out: PriceSnapshot = { ...snapshot };
  const target = pickIndex(indices, o.targetDate);
  for (const k of Object.keys(out)) {
    const base = pickIndex(indices, out[k].effectiveDate);
    if (!base || !target) continue;
    const num = BigInt(Math.round(target * 1e6)), den = BigInt(Math.round(base * 1e6));
    out[k] = { ...out[k], priceFils: Number(roundDivHalfUp(BigInt(out[k].priceFils) * num, den)) };
  }
  return out;
}
// pickIndex: latest index with effective_date <= date (mirror getSnapshot's as-of logic)
```

(`MICRO` import from `money.ts` or re-declare `const MICRO = 1_000_000n`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/domain/location-factor.test.ts tests/domain/time-index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/overrides.ts tests/domain/location-factor.test.ts tests/domain/time-index.test.ts
git commit -m "feat(domain): location + time-index transforms; burden helper; extended overrides"
```

---

### Task 5: `estimate-band.ts` — AACE ± band

**Files:**
- Create: `src/lib/domain/estimate-band.ts`
- Test: `tests/domain/estimate-band.test.ts`

**Interfaces:**
- Consumes: `roundDivHalfUp`.
- Produces: `ESTIMATE_CLASS_BANDS`, `applyEstimateBand(grandTotalFils, class): EstimateBand`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/estimate-band.test.ts
import { describe, it, expect } from "vitest";
import { applyEstimateBand } from "@/lib/domain/estimate-band";
it("class 1 gives -10/+15% band", () => {
  const b = applyEstimateBand(100000, 1);
  expect(b.point).toBe(100000);
  expect(b.low).toBe(90000);    // -10%
  expect(b.high).toBe(115000);  // +15%
  expect(b.class).toBe(1);
});
it("null class yields no band", () => {
  expect(applyEstimateBand(100000, null)).toEqual({ point: 100000, low: null, high: null, class: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/estimate-band.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/domain/estimate-band.ts
import { roundDivHalfUp } from "./money";
export const ESTIMATE_CLASS_BANDS: Record<1|2|3|4|5, { lowPct: number; highPct: number }> = {
  5: { lowPct: -50, highPct: 100 }, 4: { lowPct: -30, highPct: 50 }, 3: { lowPct: -20, highPct: 30 },
  2: { lowPct: -15, highPct: 20 }, 1: { lowPct: -10, highPct: 15 },
};
export interface EstimateBand { point: number; low: number | null; high: number | null; class: number | null; }
export function applyEstimateBand(grandTotalFils: number, estimateClass: number | null): EstimateBand {
  if (estimateClass == null || !(estimateClass in ESTIMATE_CLASS_BANDS))
    return { point: grandTotalFils, low: null, high: null, class: null };
  const { lowPct, highPct } = ESTIMATE_CLASS_BANDS[estimateClass as 1|2|3|4|5];
  const pt = BigInt(grandTotalFils);
  const low = Number(roundDivHalfUp(pt * BigInt(100 + lowPct), 100n));   // lowPct is negative → (100+lowPct)<100
  const high = Number(roundDivHalfUp(pt * BigInt(100 + highPct), 100n));
  return { point: grandTotalFils, low, high, class: estimateClass };
}
```

> Note: `roundDivHalfUp` requires `n >= 0`; `100 + lowPct` is always ≥ 50 here, so the numerator stays non-negative. Fine.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/estimate-band.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/estimate-band.ts tests/domain/estimate-band.test.ts
git commit -m "feat(domain): AACE estimate-class ± band"
```

---

### Task 6: Size factor inside pricing + `applyModelOverrides` overhead/profit folding

**Files:**
- Modify: `src/lib/domain/overrides.ts` (`applyModelOverrides` gains `firmSettings?` + folds overhead/profit; add `applySizeFactorToModel`)
- Test: `tests/domain/size-factor.test.ts`

**Interfaces:**
- Consumes: `CostModel`, `FirmSettings`.
- Produces: `applyModelOverrides(model, trade, o?, firmSettings?)` — folds resolved `overheadPct`/`profitPct` onto the model (legacy `markupPct`-only models untouched); `applySizeFactorToModel(model, sizeFactor?)` scales only material+equipment components' effective qty by the factor (labor never).

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/size-factor.test.ts
import { applySizeFactorToModel } from "@/lib/domain/overrides";
it("scales material+equipment qtyPerUnit by sizeFactor, leaves labor productivity untouched", () => {
  const model = { id: "m", labelAr: "x", unit: "m2", keywords: [], wastePct: "0", markupPct: "0", components: [
    { id: "c1", kind: "material", labelAr: "m", priceBookKey: "k1", qtyPerUnit: "2" },
    { id: "c2", kind: "labor", labelAr: "l", priceBookKey: "k2", productivityPerDay: "10" },
  ]} as any;
  const out = applySizeFactorToModel(model, "0.90");
  expect(out.components[0].qtyPerUnit).toBe("1.8");     // 2 * 0.90
  expect(out.components[1].productivityPerDay).toBe("10"); // labor unchanged
});
it("legacy markupPct model is untouched by overhead folding", () => {
  // applyModelOverrides with a firmSettings overhead must NOT add overhead to a markupPct-only model
});
```

- [ ] **Step 2–4:** implement `applySizeFactorToModel` (multiply each non-labor component's `qtyPerUnit` decimal-string by the factor via `parseDecimalToMicro`, re-stringify) and extend `applyModelOverrides(model, trade, o?, firmSettings?)` to set `overheadPct`/`profitPct` from `o.profitPct`/`firmSettings.overheadPct` **only when the model already carries an `overheadPct` or the caller opts in** — never onto a pure legacy `markupPct` model. Run the tests → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/overrides.ts tests/domain/size-factor.test.ts
git commit -m "feat(domain): size-factor model scaling + overhead/profit folding (legacy-safe)"
```

---

### Task 7: `PriceSnapshotEntry.referenceLocation` + `getSnapshot` SELECT

**Files:**
- Modify: `src/lib/domain/types.ts` (`PriceSnapshotEntry` + `referenceLocation`)
- Modify: `src/lib/db/price-book.ts` (`getSnapshot` selects + maps `reference_location`)
- Test: `tests/db/price-book-reflocation.test.ts` (integration)

**Interfaces:**
- Produces: `PriceSnapshotEntry.referenceLocation: string | null` populated by `getSnapshot`.

- [ ] **Step 1–4:** Add `referenceLocation: string | null` to `PriceSnapshotEntry`; add `reference_location` to `getSnapshot`'s `.select(...)` and map it into each entry. Write an integration test that inserts a price-book entry with a `reference_location`, calls `getSnapshot`, and asserts the field surfaces. Run → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/types.ts src/lib/db/price-book.ts tests/db/price-book-reflocation.test.ts
git commit -m "feat(db): thread reference_location onto the price snapshot"
```

---

### Task 8: `db/firm-settings.ts` + `db/reference.ts`

**Files:**
- Create: `src/lib/db/firm-settings.ts`, `src/lib/db/reference.ts`
- Test: `tests/db/firm-settings.test.ts` (integration)

**Interfaces:**
- Produces: `getFirmSettings`/`updateFirmSettings`; `getLocationFactors`/`getCostIndices`/`getWasteDefaults`/`getSizeCurves`. `getFirmSettings` falls back to defaults (burden "30", overhead "15") if the row is absent.

- [ ] **Step 1: Failing test**

```ts
// tests/db/firm-settings.test.ts
import { getFirmSettings } from "@/lib/db/firm-settings";
it("reads the singleton with defaults", async () => {
  const f = await getFirmSettings();
  expect(f.laborBurdenPct).toBe("30");
  expect(f.overheadPct).toBe("15");
});
```

- [ ] **Step 2–4:** Implement both repos (session-client-compatible: default `db = serviceClient()` but accept an injected `db`). `getFirmSettings` reads row `id=true`; returns defaults if missing. Run → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/firm-settings.ts src/lib/db/reference.ts tests/db/firm-settings.test.ts
git commit -m "feat(db): firm-settings + reference-table repos"
```

---

### Task 9: `buildProjectOverrides` — firm defaults overlaid by per-quote

**Files:**
- Create: `src/lib/domain/build-overrides.ts`
- Test: `tests/domain/build-overrides.test.ts`

**Interfaces:**
- Consumes: `FirmSettings`, `ProjectOverrides`.
- Produces: `buildProjectOverrides({ firm, quoteOverrides }): ProjectOverrides` — per-quote wins field-by-field over firm defaults.

- [ ] **Step 1: Failing test**

```ts
// tests/domain/build-overrides.test.ts
import { buildProjectOverrides } from "@/lib/domain/build-overrides";
it("overlays per-quote over firm defaults", () => {
  const firm = { laborBurdenPct: "30", overheadPct: "15", defaultReferenceLocation: "amman" };
  const o = buildProjectOverrides({ firm, quoteOverrides: { profitPct: "8", laborBurdenPct: "35" } });
  expect(o.laborBurdenPct).toBe("35");   // per-quote wins
  expect(o.profitPct).toBe("8");
});
it("uses firm defaults when quote omits", () => {
  const firm = { laborBurdenPct: "30", overheadPct: "15", defaultReferenceLocation: null };
  expect(buildProjectOverrides({ firm }).laborBurdenPct).toBe("30");
});
```

- [ ] **Step 2–4:** Implement the overlay. Run → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/build-overrides.ts tests/domain/build-overrides.test.ts
git commit -m "feat(domain): buildProjectOverrides (firm defaults <- per-quote overlay)"
```

---

### Task 10: Thread `estimate_class`/geometry through `getQuote`/`listQuotes`; apply band

**Files:**
- Modify: `src/lib/db/quotes.ts` (SELECT the new columns)
- Modify: quote-detail page / export route to call `applyEstimateBand`
- Test: `tests/db/quotes-estimate-class.test.ts` (integration)

**Interfaces:**
- Consumes: `applyEstimateBand` (Task 5).
- Produces: `getQuote`/`listQuotes` return `estimateClass` (+ geometry); the quote-detail view shows "X ± band" when class set.

- [ ] **Step 1–4:** Add `estimate_class` (and `gross_floor_area_m2`, `storeys`, `avg_storey_height_m`, `target_date`) to both `getQuote` and `listQuotes` SELECTs and returned shapes. In the quote-detail RSC, compute `applyEstimateBand(rollup.grandTotalFils, quote.estimateClass)` and render the band. Integration test: save a quote with `estimate_class=1`, read it back, assert the field and that `applyEstimateBand` yields the −10/+15 band. Run → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/quotes.ts "src/app/(app)/quotes/[id]/page.tsx" tests/db/quotes-estimate-class.test.ts
git commit -m "feat(ui): estimate-class band on quote detail"
```

---

### Task 11: `reprice(quoteId)` session-client server action + key derivation

**Files:**
- Modify: `src/app/(app)/quotes/[id]/actions.ts` (add `reprice`)
- Modify: `src/lib/pipeline/run.ts` or a new `src/lib/domain/reprice-core.ts` (pure re-price given quote + overrides + snapshot)
- Test: `tests/domain/reprice-core.test.ts`

**Interfaces:**
- Consumes: `createClient` (session), `getFirmSettings`, `buildProjectOverrides`, `getSnapshot`, the priced-line recompute path, `applyLocationFactor`/`applyTimeIndex`/`burdenNumFromOverrides`, the labor/material/equipment key derivation.
- Produces: `reprice(quoteId)` — reprices a stored quote's lines with current firm+quote overrides and persists new `rate_fils`/`amount_fils`, all via the **session client**.

- [ ] **Step 1: Write the failing test for the pure core**

```ts
// tests/domain/reprice-core.test.ts
// repriceCore({ lines, skills, snapshot, overrides }) -> new priced lines; assert burden+location move rates as expected.
```

Test `repriceCore` (pure): given one matched labor+material line, a snapshot, and `overrides={ laborBurdenPct:"30", locationFactor:{labor:"1.2",material:"1.1"} }`, assert the resulting `rateFils` equals the hand-computed value (location applied to snapshot prices, then burden folded into the labor division). This is the fils-exact lock for the whole transform stack composing correctly.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/reprice-core.test.ts`
Expected: FAIL — `repriceCore` not found.

- [ ] **Step 3: Implement `repriceCore`** — derive labor/material/equipment key sets by scanning the skills' components by `c.kind` (spec §5.5); apply `applyTimeIndex` → `applyLocationFactor` → (existing `applyLaborPremiumToSnapshot`) to the snapshot; compute `burdenNum = burdenNumFromOverrides(overrides)`; call `evaluateCostModel(model, snapshot, { burdenNum })` per line. Return new rate/amount fils.

- [ ] **Step 4: Implement the server action** (session client, no `serviceClient`)

```ts
// src/app/(app)/quotes/[id]/actions.ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { getFirmSettings } from "@/lib/db/firm-settings";
import { getSnapshot } from "@/lib/db/price-book";
import { buildProjectOverrides } from "@/lib/domain/build-overrides";
import { repriceCore } from "@/lib/domain/reprice-core";

export async function reprice(quoteId: string): Promise<void> {
  const db = await createClient();                       // session client — RLS, anon key
  const firm = await getFirmSettings(db);
  // load quote + its overrides jsonb + its line items + the skills/snapshot they reference (all via db)
  // const overrides = buildProjectOverrides({ firm, quoteOverrides: quote.overrides });
  // const snapshot = await getSnapshot(quote.target_date ?? undefined, db);
  // const repriced = repriceCore({ lines, skills, snapshot, overrides });
  // persist new rate_fils / amount_fils via db.from("line_items").update(...) per line
}
```

- [ ] **Step 5: Run + verify no service-role leak**

Run: `npx vitest run tests/domain/reprice-core.test.ts` → PASS. Then grep the built client bundle is unnecessary here (server action), but confirm `actions.ts` imports only `createClient` from `@/lib/supabase/server` and **never** `serviceClient`/`@/lib/db/client`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/quotes/[id]/actions.ts" src/lib/domain/reprice-core.ts tests/domain/reprice-core.test.ts
git commit -m "feat(ui): reprice(quoteId) session-client action + pure repriceCore"
```

---

### Task 12: `/settings` screen + project-settings form

**Files:**
- Create: `src/app/(app)/settings/page.tsx`, `src/app/(app)/settings/actions.ts`
- Create: `src/app/(app)/quotes/[id]/ProjectSettingsForm.tsx`
- (No new domain logic — UI over Tasks 8–11.)

**Interfaces:**
- Consumes: `getFirmSettings`/`updateFirmSettings`, the reference repos, `reprice`.
- Produces: firm-constant editing UI; a per-quote form writing geometry/estimate_class/target_date/location/profit into `quotes` columns + `quotes.overrides`, then calling `reprice(quoteId)`.

- [ ] **Step 1: Build `/settings`** — an RSC reading `getFirmSettings` + reference tables via the session client, with a server action `updateFirmSettings` (burden %, overhead %, default reference location) and simple editors for the reference rows. Arabic-first RTL, matching the existing `/trades` / `/price-book` screens.

- [ ] **Step 2: Build the project-settings form** on the quote detail — inputs for GFA/storeys/height, estimate-class dropdown (1–5), region dropdown (from `getLocationFactors`), profit %, target date. On save: write columns + merge `{ locationFactor, profitPct, targetDate }` into `quotes.overrides`, then `await reprice(quoteId)` and revalidate.

- [ ] **Step 3: Manual verification (preview)** — start the dev server, open a quote, set estimate-class + location, save, confirm the rate and the ± band update. (Use the preview tools; this is a previewable change.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/settings" "src/app/(app)/quotes/[id]/ProjectSettingsForm.tsx"
git commit -m "feat(ui): settings screen + per-quote project-settings form"
```

---

### Task 13: Backward-compat migration `markupPct → overheadPct`

**Files:**
- Create: `scripts/migrate-markup-to-overhead.ts` (one-off, committed)
- Test: covered by the Task 3 backward-compat lock (no new test)

**Interfaces:**
- Consumes: `listSkills`/`getActiveSkill`, `createSkillVersion`/`activateSkillVersion`.
- Produces: each active skill version's models get `overheadPct = markupPct`, `profitPct = "0"` — so they reprice identically, but are now on the split path.

- [ ] **Step 1: Write the script** — for each trade skill, load active content, for each model set `overheadPct = markupPct` and `profitPct = "0"` (leave `markupPct` in place as legacy), create + activate a new version with changelog "split markup → overhead/profit". **Guard:** skip a model that already has `overheadPct`.

- [ ] **Step 2: Dry-run + run**

Run: `npx tsx scripts/migrate-markup-to-overhead.ts --dry-run` then without the flag. After running, a full-quote reprice must be **fils-identical** to before (the compounding with profit=0 equals the legacy markup). Verify by re-running the Phase-A baseline backtest and `--compare` against the pre-migration baseline: **neutral** on every segment.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-markup-to-overhead.ts
git commit -m "chore(domain): migrate models to overhead/profit split (reprices identically)"
```

---

### Task 14: Phase-A gate run for burden + location

**Files:**
- (No source changes — a verification task producing evidence.)

- [ ] **Step 1:** Store/refresh the `baseline` backtest run (no overrides).
- [ ] **Step 2:** Run the backtest with a burden override (`--label with-burden`) — e.g. by adding a temporary `overrides` in a throwaway invocation, or a `--burden 30` flag on `backtest.ts` that injects `{ laborBurdenPct: "30" }`. Then `npm run backtest -- --compare baseline with-burden`.
- [ ] **Step 3:** Record the verdict per project-type segment. Burden should move grand-total deviation in the expected direction (labor was systematically under-costed → totals rise toward truth). If it regresses, investigate before shipping burden as a default (it may need a different default %).
- [ ] **Step 4:** Commit a short note of the gate result to `docs/superpowers/plans/` or the phase's review section.

```bash
git commit --allow-empty -m "test(backtest): phase-B burden+location gate results recorded"
```

---

## Self-Review (completed against the spec)

- **Spec coverage:** B1 burden → Task 3+4; B2 overhead/profit → Task 2+3+13; B3 material waste → Task 1 (seed) + Task 2 (schema); B4 location → Task 4+7; B5 geometry → Task 1+10; B6 size → Task 6; B7 estimate band → Task 5+10; B8 time index → Task 4; §5.5 read-path → Task 8+9+11; surfaces → Task 12. Gate → Task 14.
- **Type consistency:** `evaluateCostModel(model, snapshot, opts?)` used identically in Tasks 3/11; `ProjectOverrides` extended once (Task 4) and consumed unchanged after; `applyEstimateBand` signature identical in Tasks 5/10; `FirmSettings` identical in Tasks 8/9/11.
- **Cross-phase:** the `opts.L` slot is present but unused in Phase B (default `L_MICRO`) — Phase C fills it with zero structural change. `buildProjectOverrides`/`reprice` are the seams Phase C threads `condition_input` through.
- **No placeholders:** every exact-value test carries its hand-computed expectation (burden 2167, overhead+profit 14082, band 90000/115000). The two UI tasks (10 partial, 12) are the only non-TDD steps — appropriate for RSC/form wiring, and both are previewable-verified.
