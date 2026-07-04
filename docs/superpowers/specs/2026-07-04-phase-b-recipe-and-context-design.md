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
line 25-26  labor  += roundDivHalfUp(price × MICRO, productivity)   // ← burden inserts on `price`
line 35     waste   = material × wastePct/100                       // ← per-material waste refines this
line 37     markup  = base × markupPct/100                          // ← split into overhead × profit here
```

`src/lib/domain/overrides.ts` already exposes the transform pattern (`applyModelOverrides`, `applyLaborPremiumToSnapshot`, `applyPriceOverrides`). **New modifiers slot in as new `apply*` transforms or new fields on `ProjectOverrides` — no new pipeline.**

## 3. Parameters

### B1. Labor burden % — P0, setup-once *(the single biggest fix)*
A bare day-rate omits employer on-costs (insurance, social security, tools, non-productive paid time) — **25–40% of true labor cost, up to ~70%**. Omitting it under-costs labor on *every line*: a systematic, first-order bias, not scatter.

- **Where:** multiply `price` by `(1 + burden)` *before* the divide at `cost-engine.ts:26`. Equivalent to a labor-only price uplift.
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

```sql
create table firm_settings (
  id boolean primary key default true check (id),   -- single-row guard
  labor_burden_pct numeric not null default 30,
  overhead_pct numeric not null default 15,
  default_reference_location text,                  -- fallback base for the location factor (B4)
  updated_at timestamptz default now()
);

alter table quotes
  add column gross_floor_area_m2 numeric,
  add column storeys integer,
  add column avg_storey_height_m numeric,
  add column estimate_class integer,           -- 1..5, drives ± band
  add column target_date date;
-- location/profit/size/time live inside quotes.overrides (jsonb) — no column churn

alter table price_book_entries
  add column reference_location text;           -- so location factor is relative

-- reference/seed tables (firm-editable):
--   location_factors(region, labor_index, material_index)
--   cost_indices(effective_date, index_value)
--   material_waste_defaults(material_category, waste_pct)
--   size_curves(facility_type, curve jsonb)
```

`ProjectOverrides` (`overrides.ts`) gains: `laborBurdenPct?`, `profitPct?`, `locationFactor?`, `sizeFactor?`, `targetDate?`. Each is an optional additive transform — absent = current behaviour.

## 6. Transform order

Follows the **authoritative pipeline in the roadmap (§7)** — this spec does not redeclare it. The Phase-B transforms occupy these slots: snapshot-level `applyTimeIndex` → `applyLocationFactor` → `applyLaborBurden`; per-model `applyModelOverrides` (waste + overhead/profit) → `applySizeFactor`. Note the roadmap's **single-rounding rule**: burden multiplies `price` and Phase-C's `L` divides `productivity` in **one** `roundDivHalfUp(price×(1+burden)×MICRO, productivity/L)` — not two sequential rounded ops. A fils-exact test locks this (see §7).

## 7. Testing

- Each transform: pure unit test, fils-exact, absent-field = identity.
- `evaluateCostModel` with burden: labor rises by exactly burden%; material/equipment unchanged.
- Overhead/profit split: legacy `markupPct`-only model reprices identically (backward-compat lock).
- Full-pipeline golden test: AlSafi baseline vs +burden via **Phase-A backtest** — assert the direction and that grand-total deviation does not regress.
- Estimate-class band: rollup emits correct low/high for each class.

## 8. Deliverables checklist

- [ ] `firm_settings` table + `/settings` screen (burden, overhead, reference tables).
- [ ] `quotes` new columns + project-settings form on quote detail.
- [ ] `price_book_entries.reference_location`.
- [ ] Transforms: `applyLaborBurden`, `applyLocationFactor`, `applyTimeIndex`, `applySizeFactor`; overhead/profit in `evaluateCostModel`.
- [ ] Seed tables: location factors, cost indices, material waste defaults, size curves.
- [ ] Estimate-class → ± band in rollup + UI display of the range.
- [ ] Backward-compat migration for `markupPct` → overhead/profit.
- [ ] Tests + Phase-A backtest run for burden and location (the two P0 multipliers).
