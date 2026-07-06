# Phase B — Rate-Recipe Completion & Context Modifiers

**Date:** 2026-07-04
**Status:** Design (approved for spec-writing)
**Depends on:** Phase A (each field is A/B-gated)
**Parent:** `2026-07-04-accuracy-program-roadmap.md`

---

## 1. Purpose

Close the gaps in the unit-rate recipe and add the cheapest high-value whole-estimate modifiers. Every field here is either a **firm constant (set once)** or a **single per-quote input** — none are per-line. Biggest accuracy-per-effort, and it establishes the **project-settings surface** that Phases C and D extend.

## 2. Current math (the insertion map)

`src/lib/domain/cost-engine.ts::evaluateCostModel`:

```
line 25-26  labor  += roundDivHalfUp(price × MICRO, productivity)   // ← burden (+ Phase-C L) enter this division, roadmap §7.2
line 35     waste   = material × wastePct/100                       // ← per-material waste refines this
line 37     markup  = base × markupPct/100                          // ← split into overhead × profit here
```

`src/lib/domain/overrides.ts` already exposes the transform pattern (`applyModelOverrides`, `applyLaborPremiumToSnapshot`, `applyPriceOverrides`). **New modifiers slot in as new `apply*` transforms or new fields on `ProjectOverrides` — no new pipeline.**

## 3. Parameters

### B1. Labor burden % — P0, setup-once *(the single biggest fix)*
A bare day-rate omits employer on-costs (insurance, social security, tools, non-productive paid time) — **25–40% of true labor cost, up to ~70%**. Omitting it under-costs labor on *every line*: a systematic, first-order bias, not scatter.

- **Where:** carried into `evaluateCostModel` as `opts.burdenNum` and folded into the single fixed-point labor division (roadmap §7.2) — not a separate rounded price uplift. Net effect: a labor-only uplift of `burden%`.
- **Storage:** firm constant. New `firm_settings` table (single row) `labor_burden_pct numeric`. Also expressible as `ProjectOverrides.laborBurdenPct` for per-project override (reuses the existing labor-premium machinery — note burden ≠ premium: burden is a firm baseline, premium is a project condition like a remote site; they compound).
- **Capture:** Settings screen, one number. Seed default 30%.
- **Guardrail:** burden and the existing `laborPremiumPct` are distinct transforms and both apply; document the order (burden first, then premium).

### B2. Split `markupPct` → overhead % + profit % — P1, setup-once + per-project
Today one blended `markupPct`. Split lets **overhead** be a firm constant (15–25% on direct cost) and **profit** a per-project business decision (5–20%, higher for commercial/risky work) — margin control without re-versioning trade skills.

- **Where:** replace the single markup at `cost-engine.ts:37` with `base × (1+overhead) × (1+profit)` (RSMeans convention: compounding, not additive).
- **Storage:** overhead → `firm_settings.overhead_pct`; profit → `quotes.overrides.profitPct` (per-project). **Backward-compat:** if a cost model still carries a legacy `markupPct` and no overhead/profit is set, keep current behaviour. Migration path: `markupPct` → `overheadPct` default, `profitPct` = 0, so existing quotes reprice identically until the engineer sets a profit.
- **Capture:** overhead on Settings; profit on the per-quote project-settings form.

### B3. Per-material waste defaults — P2, setup-once
`wastePct` is one value per cost-model, but real waste is material-specific (mortar 1–2%, tiles 8–15% cutting, structural steel 12–15%, stone 8–12%). Small effect (material-only) but trivial to seed.

- **Where:** waste can move from model-level to component-level (`CostComponent.wastePct?` overriding `model.wastePct`) at `cost-engine.ts:35`. Model-level stays the default.
- **Storage:** seed a `material_waste_defaults` reference table (material category → %); `TradeEditor` pre-fills component waste from it. Engineer overrides per project via existing `overrides.models[id].wastePct`.
- **Capture:** mostly automatic (seed); optional per-component override in the trades editor.

### B4. Location / regional cost factor — P0, per-project
Whole-estimate multiplier ~**0.80–1.35×**. One of the top-2 cost predictors.

- **Where:** a new `applyLocationFactor` transform on the snapshot, applied **separately to labor and material keys** (labor and material indices differ). Applied relative to the base rate's reference location (guardrail: tag base rates with their reference location so we don't double-count).
- **Storage:** `quotes.overrides.locationFactor: {labor?: string, material?: string}` — the **structured** shape (a single blended scalar can't be applied separately to labor vs material, so it is not offered). Seed a `location_factors` reference table (region → labor/material index).
- **Capture:** one region dropdown on the project-settings form → looks up the factor.
- **Prerequisite / backfill:** add `reference_location` to price-book entries so the factor is relative. Existing rows are NULL; the transform falls back to `firm_settings.default_reference_location` for any entry with a NULL `reference_location`, so the factor is **never** applied against an undefined base. (The date half of the "reference location and date" guardrail is already satisfied by the existing `effective_date` column — no new column needed.)

### B5. Building geometry: GFA, storeys, storey-height — P0, per-project
The **dominant cost predictors** (GFA rank 1 ~27%, storey-height rank 2 ~18%, storeys rank 3 ~17%) and the anchor inputs for future ML. In Phase B they primarily (a) drive B6 size-economies and the Phase-C height band, and (b) get *stored* so later phases and the backtest can segment on them.

- **Where:** stored on `quotes` (new columns `gross_floor_area_m2 numeric`, `storeys integer`, `avg_storey_height_m numeric`). Not yet a direct multiplier in Phase B except via B6.
- **Capture:** three numbers on the project-settings form (the engineer has them from drawings).

### B6. Size economies-of-scale multiplier — P1, per-project
Unit cost drops as size grows (fixed general-conditions spread over more area, bulk buying) — ~30% lower $/SF when doubling area at the small end.

- **Where:** applied to **fixed/bulk components only, not uniformly to labor** (guardrail). Cleanest: tag components as fixed-vs-variable; scale only fixed ones by a size curve keyed on GFA (B5) vs a per-facility-type reference size.
- **Storage:** `size_curves` reference table (facility type → curve); `quotes.overrides.sizeFactor` derived.
- **Capture:** derived from B5 + project type; no extra input.

### B7. Estimate class → ± confidence band — P0, per-project *(makes the number honest)*
The **strongest single accuracy determinant** is design/scope maturity. Declaring what deliverables exist self-assigns an **AACE 18R-97 class** whose band becomes the reported confidence interval:

| Class | Deliverables | Band |
|---|---|---|
| 5 | Concept | −50 / +100 % |
| 4 | Schematic | −30 / +50 % |
| 3 | ~30% design | −20 / +30 % |
| 2 | ~70% design | −15 / +20 % |
| 1 | IFC / full BOQ | −10 / +15 % |

- **Where:** does **not** change the point rate; **extends** the rollup with `{ point, low, high, class }` (does not replace `QuoteRollup { grandTotalFils, sections[] }`; existing `checkRatios`/`validateRollup` consumers unaffected). Displayed in the UI as "X ± band" instead of a bare number.
- **Storage:** `quotes.estimate_class integer check (estimate_class between 1 and 5)`, nullable; seed the class→band table. **Null-class behavior:** a quote with no declared class shows the bare point number and **no** band (the estimator does not invent a confidence interval it can't justify).
- **Capture:** one dropdown (or a small deliverables checklist that maps to a class) on the project-settings form.
- **Note:** the band is a rule-of-thumb CI in Phase B; Phase D can replace it with a risk-derived interval.

### B8. Time index (base-rate date → tender date) — P1, per-project
Rates carry a snapshot date; tender prices drift (~3%/yr + build-period escalation). Understating it under-costs long-lead projects.

- **Where:** `applyTimeIndex` transform on the snapshot: `adjusted = base × (index@target ÷ index@base)`.
- **Storage:** `quotes.overrides.targetDate`; a `cost_indices` reference table (date → index), firm-editable. Base date = `price_book_entries.effective_date` (surfaced as `asOf` in the `PriceSnapshot`).
- **Capture:** one date on the project-settings form (defaults to today).

## 4. New surfaces

- **Settings screen** (`/settings`, new): firm constants — labor burden %, overhead %, material-waste defaults table, reference tables (location factors, cost indices, size curves) as editable data. Single-tenant, so one firm.
- **Project-settings form** on the quote (extends the existing quote detail): location, GFA/storeys/height, profit %, estimate class, target date. Filled once per quote; writes to `quotes` columns + `quotes.overrides`.
- **Trades editor**: pre-fill component waste from the seed table (B3).

## 5. Data-model changes

Follows the **new-table convention (roadmap §7.3)**: `firm_settings` + the 4 reference tables are UI-edited → RLS-enabled with `authenticated` DML + at least an `authenticated select` policy (the session-client reprice path reads them). One migration for the whole phase; sorts last (roadmap §7.4).

```sql
create table firm_settings (
  id boolean primary key default true check (id),   -- single-row guard
  labor_burden_pct numeric not null default 30,     -- percent, applied ×(100+pct)/100
  overhead_pct numeric not null default 15,         -- percent; seeds NEW models only (see B2)
  default_reference_location text,                  -- fallback base for the location factor (B4)
  updated_at timestamptz default now()
);

alter table quotes
  add column gross_floor_area_m2 numeric,
  add column storeys integer,
  add column avg_storey_height_m numeric,
  add column estimate_class integer check (estimate_class between 1 and 5),  -- nullable; null ⇒ no band
  add column target_date date;
-- location/profit/size live inside quotes.overrides (jsonb) — no column churn

alter table price_book_entries
  add column reference_location text;               -- so the location factor is relative (nullable)

-- Reference tables (full DDL, firm-editable via /settings):
create table location_factors (
  region text primary key,
  labor_index numeric not null,       -- e.g. 1.15 (direct multiplier, NOT a percent)
  material_index numeric not null
);
create table cost_indices (
  effective_date date primary key,
  index_value numeric not null        -- e.g. 100.0 base, 103.0 next year
);
create table material_waste_defaults (
  material_category text primary key, -- join key = CostComponent.materialCategory (new optional field)
  waste_pct numeric not null
);
create table size_curves (
  facility_type text primary key,
  ref_size_m2 numeric not null,       -- explicit power law: sizeFactor = (gfa / ref_size_m2)^(exponent-1)
  exponent numeric not null
);

-- Seed rows (representative; firm tunes):
-- material_waste_defaults: ('mortar',1.5),('tile',10),('structural_steel',13),('stone',10),('concrete',2)
-- size_curves: ('generic', 1000, 0.90)   -- ~10% unit-cost drop per doubling on fixed components
-- location_factors: (<firm home region>, 1.00, 1.00)   -- base; others relative to it
-- cost_indices: (<price-book base date>, 100.0)         -- base index
```

`CostModelSchema` (`skill-schema.ts`) gains optional `overheadPct`, `profitPct` (B2), and `CostComponentSchema` gains optional `materialCategory` (B3 join key). `markupPct` becomes legacy/optional. These are **versioned-content schema changes** — a new skill version, not just DB columns.

`ProjectOverrides` (`overrides.ts`) gains: `laborBurdenPct?: string` (percent), `profitPct?: string` (percent), `locationFactor?: { labor?: string; material?: string }` (direct indices), `sizeFactor?: string` (direct multiplier), `targetDate?: string` (ISO date). All strings match `parseDecimalToMicro` (`^\d+(\.\d{1,6})?$`, non-negative). **Application rules:**
- `laborBurdenPct` is **special** — it is *not* a snapshot price uplift. It is converted to `burdenNum` and carried into `evaluateCostModel` as `opts.burdenNum` so it enters the single fixed-point division alongside Phase-C `L` (roadmap §7.2). Applied exactly once (see §5.5).
- `profitPct` applies like `markupPct` — `× (100+pct)/(100·MICRO)` — inside the overhead/profit compounding in `evaluateCostModel`.
- `locationFactor` / `sizeFactor` are **direct indices** — `roundDivHalfUp(price × idxMicro, MICRO)`, **no** divide-by-100. Do not divide an index by 100.

## 5.5 Transform & read-path contracts

**Signatures** (each identity when its override is absent; fils-exact):

- `applyLaborBurden(snapshot, laborKeys, o?)` — mirrors the existing `applyLaborPremiumToSnapshot`; uplifts labor-key prices by `laborBurdenPct`. *(Per roadmap §7.1/§7.2, burden is ultimately carried into `evaluateCostModel` via `opts.burdenNum` so it composes with Phase-C `L` in one rounding; the snapshot transform form is used only where burden is applied independently of `L`. Implement burden **once** — as the `opts.burdenNum` path — and derive the snapshot helper from it, to avoid two burden applications. State this explicitly so an implementer doesn't double-apply.)*
- `applyLocationFactor(snapshot, laborKeys, materialKeys, equipmentKeys, o?)` — mirrors `applyLaborPremiumToSnapshot`. Multiplies labor-key entries by `locationFactor.labor`, material-key by `locationFactor.material`, **equipment-key by the material index** (stated explicitly). **Key derivation:** labor/material/equipment key sets are derived in `price-quote.ts` (alongside the existing labor-key scan at `:37-41`) by scanning every skill's cost-model components by `c.kind`. **No `kind` column is added** to `price_book_entries`/`PriceSnapshotEntry` — kind is a component-role property, not a price-book-row property. Applied relative to each entry's `referenceLocation` (see below).
- `applyTimeIndex(snapshot, o?)` — `adjusted = base × (index@targetDate ÷ index@baseDate)`; base date = per-entry `effectiveDate` (already on the snapshot).
- `applySizeFactor` — **not** a snapshot transform. Applied **inside `evaluateCostModel`**, scaling only the **material + equipment** sub-totals (derived from the `kind` enum: material+equipment = fixed/bulk, labor = variable/never-scaled) before waste/markup. No `CostComponentSchema` change; a finer `costBehavior` split is explicitly deferred out of Phase B.

**`reference_location` threading:** add `referenceLocation: string | null` to `PriceSnapshotEntry` (`types.ts`); add `reference_location` to `getSnapshot`'s SELECT (`price-book.ts`) and populate it. `applyLocationFactor` reads `snapshot[key].referenceLocation ?? firm_settings.default_reference_location` — so a per-entry base wins, and a NULL never applies the index against an undefined base.

**B2 overhead/profit precedence** (kills the double-count): `evaluateCostModel` computes `base × (1+overheadPct) × (1+profitPct)` **when overhead/profit present**, else falls back to `base × (1+markupPct)`. `applyModelOverrides` gains a `firmSettings?` arg and folds resolved overhead/profit onto the returned `CostModel` (engine signature unchanged; it reads `model.overheadPct`/`profitPct`). **A legacy model with `markupPct` and no `overheadPct` uses the legacy branch ONLY — `firm_settings.overhead_pct` is NOT applied to it.** Migration copies each model's own `markupPct → overheadPct`, `profitPct = 0` (so it reprices identically); `firm_settings.overhead_pct = 15` seeds only NEW models. Locked by the backward-compat fils test.

**B7 estimate-band contract:** class→band is a **code constant** `ESTIMATE_CLASS_BANDS: Record<1..5, {lowPct, highPct}>` (AACE: class 5 −50/+100 … class 1 −10/+15). A **new pure fn** `applyEstimateBand(grandTotalFils, estimateClass|null): {point, low, high, class}` in `rollup.ts` — do **not** thread class through `buildRollup` (stays line-only); call it on the rollup's `grandTotalFils`. Null class → `{point, low:null, high:null, class:null}`. Rounding: `low = roundDivHalfUp(point×(1000+lowPctMilli), 1000)`. **Threading:** `getQuote` **and** `listQuotes` must SELECT `estimate_class` (note `listQuotes` currently inlines its own reduce and never calls `buildRollup`); the export route + quote-detail page pass `quote.estimate_class` into `applyEstimateBand`.

**Read path & override assembly:**
1. `getFirmSettings(db): Promise<{laborBurdenPct, overheadPct, defaultReferenceLocation}>` — single-row read; falls back to defaults (burden 30, overhead 15) if the row is absent.
2. `buildProjectOverrides({firm, quoteOverrides}): ProjectOverrides` — overlays `quotes.overrides` (jsonb) **on top of** firm defaults field-by-field (per-quote wins).
3. Thread it: add `overrides?: ProjectOverrides` to `assembleAndPrice` (pass into `priceQuote` at `assemble.ts:65` — the param is currently dead) and to `runPipeline` (forward at `run.ts:120`).
4. Wire surfaces: **web** loads `getFirmSettings` + `quote.overrides` → `buildProjectOverrides` → the `reprice(quoteId)` session-client server action (roadmap §7.4) that persists new `rate_fils`/`amount_fils`; **CLI** (`scripts/pipeline.ts`) uses firm defaults only (it prices a file before `saveQuote`).

## 6. Transform order

Follows the **authoritative pipeline (roadmap §7)** and the **fixed-point single-rounding division (roadmap §7.2)** — this spec does not redeclare either. Phase-B slots: snapshot `applyTimeIndex` → `applyLocationFactor` (burden folded into the `evaluateCostModel` `opts.burdenNum` per §7.2, not a separate rounding) → existing `applyLaborPremium`; per-model `applyModelOverrides` (waste + overhead/profit) → `applySizeFactor` inside `evaluateCostModel`.

## 7. Testing

- Each transform: pure unit test, fils-exact, absent-field = identity.
- **Burden via `opts.burdenNum`** (roadmap §7.2 single division): labor rises by exactly burden%; material/equipment unchanged; `burdenNum=0` = current identity (the `laborFils:1667` lock).
- **Location factor:** labor keys move by labor index, material **and equipment** keys by material index, untouched keys identity; per-entry `referenceLocation` used over the firm default when present.
- **Size factor:** labor unchanged; material+equipment scale by exactly `sizeFactor`; derived purely from `kind`.
- **Overhead/profit precedence:** legacy `markupPct`-only model reprices identically (backward-compat lock); a model with overhead+profit uses the compounding branch; firm overhead is NOT applied to a legacy model.
- **Estimate band:** `applyEstimateBand` emits correct `{low, high}` per class; null class → nulls; rounding exact.
- **Index-not-percent guardrail:** a `locationFactor`/`sizeFactor` value is applied with no divide-by-100.
- Full-pipeline: AlSafi baseline vs +burden via the **Phase-A backtest** — assert grand-total deviation does not regress.

## 8. Deliverables checklist

- [ ] Migration (sorts last): `firm_settings` + 4 reference tables (full DDL + §7.3 UI-table grants/policies), `quotes` columns (+ estimate_class CHECK), `price_book_entries.reference_location`.
- [ ] Seed rows for the 4 reference tables (values in §5).
- [ ] Schema changes: `CostModelSchema` +`overheadPct`/`profitPct`, `CostComponentSchema` +`materialCategory`; `PriceSnapshotEntry` +`referenceLocation`; `getSnapshot` SELECT.
- [ ] Transforms: `applyLaborBurden` (as the `opts.burdenNum` path), `applyLocationFactor` (labor/material/equipment key derivation in `price-quote.ts`), `applyTimeIndex`, `applySizeFactor` (inside `evaluateCostModel`); overhead/profit compounding + precedence in `evaluateCostModel`/`applyModelOverrides`.
- [ ] `applyEstimateBand` in `rollup.ts`; `getQuote` **and** `listQuotes` SELECT `estimate_class`; UI range display.
- [ ] Read path: `getFirmSettings`, `buildProjectOverrides`; thread `overrides?` through `assembleAndPrice`/`runPipeline`.
- [ ] `reprice(quoteId)` session-client server action (roadmap §7.4) + `/settings` screen + project-settings form on quote detail.
- [ ] Backward-compat migration: each model's `markupPct → overheadPct`, `profitPct=0`.
- [ ] Tests (above) + Phase-A backtest run for burden and location.
