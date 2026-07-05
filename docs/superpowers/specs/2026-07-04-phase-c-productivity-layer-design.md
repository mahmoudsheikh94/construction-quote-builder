# Phase C — Productivity-Modifier Layer

**Date:** 2026-07-04
**Status:** Design (approved for spec-writing)
**Depends on:** Phase A (gated), Phase B (project-settings surface exists)
**Parent:** `2026-07-04-accuracy-program-roadmap.md`

---

## 1. Purpose

The biggest single accuracy block. Today productivity is **one flat number per trade** — a textbook rate for an ideal site. This phase adds a **condition → multiplier** layer so a condition-neutral rate becomes condition-aware: congestion, dilution of supervision, overtime, height, weather, first-of-type work. All modifiers are court-tested, seedable lookup tables. The capture UX is **layered** (per the decision): one project baseline questionnaire + optional per-line overrides for genuinely line-varying things.

## 2. The insertion point (single, clean)

`src/lib/domain/cost-engine.ts:25-26`:

```
const productivity = parseDecimalToMicro(c.productivityPerDay!);
labor += roundDivHalfUp(price * MICRO, productivity);
```

A productivity **loss multiplier** `L ≥ 1` slows effective productivity. Per **roadmap §7.2**, `productivity / L` is **not** valid BigInt arithmetic; `L` is carried as `lMicro` (bigint = `round(L × 1e6)`, ≥ `L_MICRO = 1_000_000n`) and applied inside the single rounded division that also carries burden:

```
labor = roundDivHalfUp(
  price * (100n + burdenNum) * MICRO * lMicro,
  productivity * 100n * L_MICRO
)                                                  // one roundDivHalfUp; L=1.0,burden=0 → today's identity
```

`L` is computed **once per line** and passed into `evaluateCostModel` via `opts.L` (roadmap §7.1). It only ever touches **labor** — never material, equipment, or markup. This is the entire structural change to the engine; everything else is capturing and computing `L`.

## 3. How L is composed

```
L_baseline = MCAA (Mode A)  OR  NECA (Mode B)       // MUTUALLY EXCLUSIVE — never both
  Mode A:  L_baseline = 1 + Σ(selected MCAA factor %)/100     // ADDITIVE sum of factors
  Mode B:  L_baseline = NECA column multiplier (1.00 / 1.25 / 1.50)
L_line     = per-line height/exposure multiplier     // optional, default 1.0

L = L_baseline × L_line                               // at most two factors
```

**Fixed-point composition rule (one rounding, full intermediate precision):** each factor `f_i` is a 1e6-scaled bigint; represent `L` as a rational `L_num / L_den` where `L_num = Π f_i` and `L_den = MICRO^(count−1)`. Substitute `productivity / L = productivity × L_den / L_num` into the §2 division:

```
labor = roundDivHalfUp(
  price * (100n + burdenNum) * MICRO * L_num,
  productivity * 100n * L_den
)
```

Intermediate products are carried at full precision — **never** round an `L` factor to 1e6 first. Because Mode A and Mode B are mutually exclusive, at most two factors compose (`L_baseline × L_line`), so order is commutative. A fils-exact test asserts full-precision compose differs from round-`L`-first on a boundary case (`L_baseline=1.2055, L_line=1.1005`).

**Guardrails (baked into the composer):**
- MCAA factors are **summed** (additive), not compounded, into `L_baseline`.
- **`MAX_MCAA_FACTORS = 5`** (the "~4" is a soft UI default; the enforced ceiling is 5, consistent with "2–5 factors"). `computeLossMultiplier` throws `TooManyMcaaFactors` when more than 5 are selected.
- Severity is `{key, severity, severeConfirmed?}`; `severity==='severe'` with `severeConfirmed!==true` throws `UnconfirmedSevere` (never silently clamps). The UI sets `severeConfirmed` only after the confirm gesture.
- **MCAA and NECA are mutually exclusive** project-baseline modes (`quotes.condition_mode = 'mcaa' | 'neca'`) — never stacked. The UI presents them as two tabs of "how do you want to assess site conditions?"
- Per-line `L_line` (height/exposure) stacks on the baseline **only for axes the baseline does not already cover.** Under NECA mode, a per-line **height** override disables **both** the `working_height` and `floors` NECA rows for that line (the `height_bands` table bundles the per-floor add-on); a per-line **exposure** override disables **only** the `working_conditions` row (not `occupancy`/`cleanliness`). Under MCAA mode there is no such overlap, so `L_line` stacks freely. Unit-tested (§8b).

## 4. Seed tables (verified values)

### MCAA 16-factor loss table — `mcaa_factors` (minor / average / severe %)

| Factor | Min | Avg | Sev |
|---|---|---|---|
| Stacking of trades | 10 | 20 | 30 |
| Morale & attitude | 5 | 15 | 30 |
| Reassignment of manpower | 5 | 10 | 15 |
| Crew size inefficiency | 10 | 20 | 30 |
| Concurrent operations | 5 | 15 | 25 |
| Dilution of supervision | 10 | 15 | 25 |
| Learning curve | 5 | 15 | 30 |
| Errors & omissions | 1 | 3 | 6 |
| Beneficial occupancy | 15 | 25 | 40 |
| Joint occupancy | 5 | 12 | 20 |
| Site access | 5 | 12 | 30 |
| Logistics | 10 | 25 | 50 |
| Fatigue | 8 | 10 | 12 |
| Ripple | 10 | 15 | 20 |
| Overtime | 10 | 15 | 20 |
| Season / weather change | 10 | 20 | 30 |

Applied additively: pick factors + severity, sum the %s, `L_project = 1 + sum/100`.

### NECA condition questionnaire — `neca_conditions(key, label_ar)` *(uniform weight = 1)*
**Exactly 30 rows, each scored 1 (Normal) / 2 (Difficult) / 3 (Very Difficult)** → total 30..90. No weight column (uniform weight 1) so the total maps cleanly to the bands. Row keys (snake_case; `label_ar` supplied at seed time):

`hours_worked, shift, job_documents, working_conditions, crew_density, working_height, floors, building_sqft, project_size, site_size, safety, occupancy, cleanliness, repetition, systems_complexity, access, tools, coordination, labor_availability, info_flow, decision_making, continuity, change_orders, schedule_compression, meetings, material_handling, storage, utilities_temp, inspection_regime, weather_exposure`

Bands: **30–40 → Normal (L=1.00)**, **41–70 → Difficult (L=1.25)**, **71–90 → Very Difficult (L=1.50)** (exact multipliers, ~+25% per column step).

### Overtime PI curve — `overtime_pi(hours_per_week, week_number, index_value)` *(P1)*
2D lookup → productivity index (0–1). **v1 seed policy:** seed only the two documented anchor rows (50-hr and 60-hr, at wk1 and wk10: 50→0.95/0.72, 60→0.91/0.61) or leave empty; sourcing/interpolating the full published grid is a separate P1 data task, **not** part of the Phase-C migration. When a `(hrs/week, week)` row is **absent**, the composer falls back to the MCAA "Overtime" factor. When the curve **is** used (row present + engineer supplied schedule), the composer **suppresses the MCAA "Overtime" factor** — the two are mutually-exclusive representations of the same loss; counting both double-counts. Enforced + unit-tested. (Models OT *productivity* loss only; any OT *wage* premium is a Phase-B price uplift.)

### Working-height / floor bands *(per-line override; two distinct tables)*
`height_bands(min_ft, max_ft, uplift_pct)`: `(0,10,0)`, `(10,20,25)`, `(20,NULL,50)`.
`floor_bands(min_floors, max_floors, uplift_pct)`: `(1,2,0)`, `(3,6,1)`, `(7,10,4)`, `(11,15,8)`, `(16,19,10)`, `(20,30,13)`.
**Stacking rule:** height and floor uplifts are **additive** when both apply to a line (`L_line_height = 1 + (height_uplift + floor_uplift)/100`).

### Weather / exposure — `weather_bands(exposure, uplift_pct)` *(one altitude per line, never both)*
Discrete: `('indoor_controlled', 0)`, `('outdoor_temperate', 25)`, `('outdoor_hot', 50)`. The MCAA season factor (10/20/30) is **not** in this table — it lives in the MCAA baseline. Continuous WBGT is **deferred**; if later added, `uplift_pct = round(0.57 × max(0, WBGT_°C − 20))` overrides the outdoor rows. Per §3: exposure is in the baseline **or** a per-line override, never both.

### Shift — `shift_bands(shift_type, uplift_pct)`
`('day', 0)`, `('second_night', 13)`, `('third', 18)`. Every seeded `uplift_pct` is an integer percent (no "~"). **Shift wage premium stays separate** (a Phase-B price uplift) — this table is *productivity only*.

## 5. Capture UX (layered)

**Project baseline (one of two modes, on the project-settings form from Phase B):**
- **Mode A — MCAA factor checklist:** tick applicable factors (soft default ~4, hard cap **5**), pick severity per factor (minor/avg; severe requires the confirm gesture → sets `severeConfirmed`). Live-shows the summed % and `L_baseline`.
- **Mode B — NECA questionnaire:** the **30-row** scored checklist; live-shows total score, band, and `L_baseline`. For engineers who prefer a comprehensive single-pass assessment.

Default to Mode A (faster, court-tested, fewer inputs). Engineer can switch.

**Per-line overrides (optional, on the quote line):**
- Working-height band, floor band, and indoor/outdoor exposure — the only genuinely line-varying modifiers. A line inherits the project baseline `L_baseline` and multiplies by its own `L_line`. Most lines leave it at default.

**Explainability (additive, non-destructive breakdown):** extend `RateBreakdown` (`types.ts`) with **optional** `productivityLoss?: number`, `sources?: Record<string, number>`, and `manualOverride?: boolean` (set by `applyCorrectionCore`, §6.1) **alongside** the existing fils fields (`material/waste/labor/equipment/markup/rate/priceEntryIds` — never modified). `L=1.0` lines omit them (backward-compat; no current code reads `breakdown`). Stored as new top-level keys, e.g. `{ …existing, productivityLoss: 1.32, sources: {mcaa: 1.20, height: 1.10} }` — so the engineer sees *why* a rate moved.

## 6. Data-model changes

Follows the **new-table convention (roadmap §7.3)**: the **7** seed tables (below) are UI-editable → RLS + `authenticated` DML/select. One migration, sorts last.

```sql
create table mcaa_factors   (key text primary key, label_ar text not null, minor_pct int, avg_pct int, severe_pct int);
create table neca_conditions(key text primary key, label_ar text not null);       -- uniform weight 1 (§4)
create table overtime_pi    (hours_per_week int, week_number int, index_value numeric, primary key(hours_per_week,week_number));
create table height_bands   (min_ft int, max_ft int, uplift_pct int, primary key(min_ft));   -- max_ft nullable = open top
create table floor_bands    (min_floors int, max_floors int, uplift_pct int, primary key(min_floors));
create table weather_bands  (exposure text primary key, uplift_pct int);
create table shift_bands    (shift_type text primary key, uplift_pct int);

alter table quotes
  add column condition_mode text check (condition_mode in ('mcaa','neca')) default 'mcaa',
  add column condition_input jsonb;   -- {mcaa:[{key,severity,severeConfirmed?}], neca:{scores:{key:1|2|3}}, overtime:{hrs,weeks}, shift, weather}

alter table line_items
  add column line_conditions jsonb;   -- {height_band, floor_band, exposure} — per-line overrides, nullable
```

**Types (`src/lib/domain/productivity.ts`):** `computeLossMultiplier(quoteConditions: QuoteConditions, lineConditions: LineConditions | null, seed: ConditionSeedTables): { lMicro: bigint; breakdown }` — pure, integer fixed-point, all guardrails (§3), DB-free (seed tables pre-loaded like `PriceSnapshot`). `QuoteConditions`/`LineConditions`/`ConditionSeedTables` are new domain types.

**Threading into `priceQuote` (additive; the §2 backward-compat covers `evaluateCostModel` only — `priceQuote`'s signature DOES change):** extend `priceQuote` input with `quoteConditions?: QuoteConditions` + `seedTables?: ConditionSeedTables`; add `lineConditions?: LineConditions` to `MatchedItem` (populated in `toMatchedItem`). In the per-line map, before `evaluateCostModel`:
```
const { lMicro, breakdown: lossBreakdown } = (quoteConditions && seedTables)
  ? computeLossMultiplier(quoteConditions, item.lineConditions ?? null, seedTables)
  : { lMicro: 1_000_000n, breakdown: undefined };
const rate = evaluateCostModel(model, snapshot, { burdenNum, L: lMicro });
// merge lossBreakdown (productivityLoss + sources) into rate's breakdown for persistence (§5, §6.1)
```
The returned `breakdown` (`productivityLoss` + `sources`) is merged into the line's `RateBreakdown` and persisted to `line_items.breakdown` (§6.1 freeze). Thread `seedTables` + `quoteConditions` through `assembleAndPrice`. Domain stays pure; all inputs pre-loaded plain data.

## 6.1 L persistence & recompute (freeze by default)

- **Freeze:** on pricing, the composed `lMicro` + full breakdown are snapshotted onto `line_items.breakdown`, alongside the already-pinned price snapshot + skill versions. A later **seed-table edit NEVER moves an existing quote's `L`** — same pin-history rule as prices. `condition_input`/`line_conditions` are the stored **audit trail of inputs**, not live-refed for old quotes.
- **Recompute** happens **only** on an explicit reprice/condition-edit (the `reprice(quoteId)` action, roadmap §7.4), against then-current tables, re-snapshotting `breakdown`. Seed-table edits affect only quotes priced after the edit.
- **Manual correction is not a reprice:** `applyCorrectionCore`'s `rate_fils` overrides the computed rate; set `breakdown.manualOverride = true` so the UI shows "rate set manually" instead of a now-inconsistent `L`.

## 7. Interaction with Phase B (per the roadmap pipeline)

`L` composes cleanly with Phase-B transforms: burden and location adjust *price*; `L` adjusts *productivity*. Both burden and `L` enter the **single fixed-point division (roadmap §7.2)** inside `evaluateCostModel` — one rounding event. This is not cosmetic: in the integer-fils engine it's what keeps results reproducible and the backtest stable. Locked by the §8 fils-exact test.

## 8. Testing

- `computeLossMultiplier`: additive MCAA sum; **cap = 5** (5 ok, 6 throws `TooManyMcaaFactors`); severe without `severeConfirmed` throws `UnconfirmedSevere`, severe+confirmed computes; NECA banding at the 40/70 cutoffs; MCAA/NECA mode-exclusivity.
- **(8b) Double-count guards:** (a) OT curve row present + schedule supplied ⇒ MCAA "Overtime" factor suppressed; OT row absent ⇒ MCAA factor used. (b) per-line height override under NECA mode ⇒ `working_height` **and** `floors` rows zeroed for that line; per-line exposure override ⇒ only `working_conditions` zeroed (not `occupancy`/`cleanliness`). Assert counted once.
- **Fixed-point composition (§3):** full-precision `L_num/L_den` compose differs from round-`L`-first on `L_baseline=1.2055, L_line=1.1005`.
- **`evaluateCostModel` with `opts.L`:** labor scales by exactly `L`; material/equipment/markup untouched; `L=1.0, burden=0` = the `laborFils:1667` identity.
- **Single-rounding lock (roadmap §7.2):** one `roundDivHalfUp` over `(price·(100+burdenNum)·MICRO·L_num, productivity·100·L_den)`; fils-exact against the hand-computed value; differs from a two-step burden-then-L double-rounding.
- **Height+floor additive stacking:** a line at 15 ft on floor 12 gets `1 + (25+8)/100`.
- Fils-exact; no floats in the multiplier path.
- **Phase-A backtest gate:** run the scored cases with representative conditions; must not regress grand-total deviation and must improve ≥1 project-type segment, else ships type-scoped.

## 9. Deliverables checklist

- [ ] Migration (sorts last): 7 seed tables (`mcaa_factors`, `neca_conditions`, `overtime_pi`, `height_bands`, `floor_bands`, `weather_bands`, `shift_bands`) + §7.3 UI-table grants; seed values from §4 (incl. exactly 30 NECA rows).
- [ ] `src/lib/domain/productivity.ts::computeLossMultiplier` (pure, fixed-point, all §3 guardrails) + `QuoteConditions`/`LineConditions`/`ConditionSeedTables` types.
- [ ] `evaluateCostModel` `opts.L` at the productivity step (roadmap §7.1/§7.2).
- [ ] Thread `quoteConditions`+`seedTables` through `assembleAndPrice`→`priceQuote`; `lineConditions` on `MatchedItem`.
- [ ] `quotes.condition_mode`+`condition_input`; `line_items.line_conditions`; `RateBreakdown` +`productivityLoss?`/`sources?`.
- [ ] L-persistence (freeze on price; recompute only on `reprice`; `manualOverride` on correction).
- [ ] Project-settings: MCAA checklist tab (cap 5, severe-confirm) + NECA questionnaire tab (mutually exclusive).
- [ ] Per-line height/floor/exposure override on the quote line editor.
- [ ] UI "why did this rate move?" from `breakdown.sources`.
- [ ] Tests (above) + Phase-A backtest run.
