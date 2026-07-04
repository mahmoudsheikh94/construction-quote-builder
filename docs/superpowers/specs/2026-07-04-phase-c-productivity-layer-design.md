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

A productivity **loss multiplier** `L ≥ 1` divides effective productivity (or equivalently multiplies labor):

```
effectiveProductivity = productivity / L          // L=1.0 → no change; L=1.20 → 20% slower
labor += roundDivHalfUp(price * MICRO, effectiveProductivity)
```

`L` is computed **once per line** from: the project baseline (questionnaire + factors) × any per-line overrides. It only ever touches **labor** — never material, equipment, or markup. This is the entire structural change to the engine; everything else is capturing and computing `L`.

## 3. How L is composed

```
L_project  = 1 + Σ(selected MCAA factor %)          // ADDITIVE, from the checklist
L_neca     = NECA column multiplier                  // 1.00 / 1.25 / 1.50 from the questionnaire score
L_line     = per-line height/exposure multiplier     // optional, default 1.0

L = L_project × L_neca × L_line
```

**Guardrails (baked into the composer):**
- MCAA factors are **summed** (additive), not compounded, to form `L_project`.
- Cap the number of selected MCAA factors at ~4; default severity minor/average; **"severe" cannot be auto-selected** (requires explicit engineer confirmation).
- MCAA and NECA overlap conceptually — the composer must not double-count. **Design decision: MCAA is the default engine; NECA questionnaire is an *alternative* project-baseline mode, not stacked on top.** An engineer picks one baseline method per project. `L_project` and `L_neca` are mutually exclusive; the UI presents them as two tabs of "how do you want to assess site conditions?"
- Per-line `L_line` (height/exposure) stacks on whichever baseline is chosen — **but only for axes the baseline does not already cover.** The NECA questionnaire (Mode B) contains its own "working height" and "working conditions/exposure" rows; if a line supplies a per-line height/exposure override under NECA mode, the composer **disables the corresponding NECA rows** for that line so the same physical factor is not counted at two altitudes. Under MCAA mode (Mode A) there is no such overlap, so `L_line` stacks freely. This rule is unit-tested.

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

### NECA condition questionnaire — `neca_conditions`
~30 scored rows (hours worked, shift, job documents, working conditions, crew density, working height, floors, building sqft, project size, site size, safety, occupancy, cleanliness, repetition, systems complexity, access, tools, coordination, labor availability, info flow, decisions, continuity, change orders, schedule compression, meetings). Each scored 1 (Normal) / 2 (Difficult) / 3 (Very Difficult). Total bands: **30–40 → Normal (L=1.00)**, **41–70 → Difficult (~L=1.25)**, **71–90 → Very Difficult (~L=1.50)** (~+25% per column step).

### Overtime PI curve — `overtime_pi` *(P1, replaces the MCAA "Overtime" factor when a schedule is known)*
2D lookup [hrs/week × consecutive-week] → productivity index (0–1). Sample: 50-hr week 5% loss wk1 → 28% wk10; 60-hr 9% → 39%. When the engineer supplies planned hrs/week + OT duration, the curve is used **and the composer MUST suppress the MCAA "Overtime" factor** — the two are mutually exclusive representations of the same loss, so counting both double-counts. Enforced in the composer and unit-tested. Resets to wk1 after a normal week. (This models the OT *productivity* loss only; any OT *wage* premium is a price uplift handled separately, per the roadmap guardrail.)

### Working-height / floor bands — `height_bands` *(per-line override)*
10–20 ft → ~+25%; 20 ft+ → ~+50%. Per-floor add-on +1% (3–6 floors) up to +13% (20–30 floors). Discrete dropdown.

### Weather / exposure — `weather_bands` *(captured at ONE altitude per line, never both)*
Indoor-controlled vs outdoor ~+25% (NECA column); MCAA season 10/20/30; heat ~0.57%/°C WBGT (→ ~50% loss near 32–33 °C). Optionally auto-derive expected WBGT from location (Phase B) + month. Per the §3 rule: exposure lives in the project baseline (MCAA season factor or NECA working-conditions row) **or** as a per-line override — the composer disables the baseline's exposure contribution for any line carrying a per-line exposure override, so it is never double-counted.

### Shift — `shift_bands`
2nd/night ~12–15% loss; 3rd ~15–20%. **Keep the shift wage premium separate** (that's a price uplift, handled like labor premium in Phase B) — this table is *productivity only*.

## 5. Capture UX (layered)

**Project baseline (one of two modes, on the project-settings form from Phase B):**
- **Mode A — MCAA factor checklist:** tick 2–5 applicable factors, pick severity per factor (minor/avg, severe requires confirm). Live-shows the summed % and resulting `L_project`.
- **Mode B — NECA questionnaire:** the ~30-row scored checklist; live-shows total score, band, and `L_neca`. For engineers who prefer a comprehensive single-pass assessment.

Default to Mode A (faster, court-tested, fewer inputs). Engineer can switch.

**Per-line overrides (optional, on the quote line):**
- Working-height band and indoor/outdoor exposure — the only genuinely line-varying modifiers. A line inherits the project baseline `L` and multiplies by its own `L_line`. Most lines leave it at default.

**Explainability:** each priced line stores its `L` breakdown in `line_items.breakdown` (e.g. `{ productivityLoss: 1.32, sources: {mcaa: 1.20, height: 1.10} }`) so the engineer sees *why* a rate moved — critical for trust and for the correction loop.

## 6. Data-model changes

```sql
-- seed/reference tables (firm-editable so the feedback loop can tune them later):
--   mcaa_factors(key, label_ar, minor_pct, avg_pct, severe_pct)
--   neca_conditions(key, label_ar, weight)
--   overtime_pi(hours_per_week, week_number, index_value)
--   height_bands(min_ft, max_ft, uplift_pct)
--   weather_bands(exposure, uplift_pct)
--   shift_bands(shift_type, uplift_pct)

alter table quotes
  add column condition_mode text check (condition_mode in ('mcaa','neca')) default 'mcaa',
  add column condition_input jsonb;   -- {mcaa:[{key,severity}], neca:{scores:{...}}, overtime:{hrs,weeks}, shift, weather}

alter table line_items
  add column line_conditions jsonb;   -- {height_band, exposure} — per-line overrides, nullable
```

`L` is computed in a new pure module `src/lib/domain/productivity.ts::computeLossMultiplier(quoteConditions, lineConditions, seedTables)` → returns `L` and its source breakdown. `cost-engine.ts` takes an optional `L` param (default 1.0) so existing callers/tests are unaffected.

## 7. Interaction with Phase B (per the roadmap pipeline)

`L` composes cleanly with Phase-B transforms: burden and location adjust the *price*; `L` adjusts *productivity*. Placement follows the **authoritative pipeline in the roadmap (§7)** — `L` is computed per line and passed into `evaluateCostModel`, which combines burden and `L` in the **single rounded division** `roundDivHalfUp(price×(1+burden)×MICRO, productivity/L)`. Because the engine is integer-fils, this one-rounding rule is not cosmetic — it's what keeps results reproducible and the backtest stable. Locked by a fils-exact test.

## 8. Testing

- `computeLossMultiplier`: additive MCAA sum; cap enforcement; severe-requires-confirm; NECA banding; MCAA/NECA mode-exclusivity (no double-count); per-line stacking.
- **Double-count guards (explicit tests):** (a) OT curve active ⇒ MCAA "Overtime" factor suppressed; (b) per-line height/exposure override under NECA mode ⇒ corresponding NECA rows disabled for that line. Assert the loss is counted once, not twice.
- `evaluateCostModel` with `L`: labor scales by exactly `L`; material/equipment/markup untouched; `L=1.0` = identity (backward-compat lock).
- **Single-rounding lock (roadmap §7):** `roundDivHalfUp(price×(1+burden)×MICRO, productivity/L)` gives one rounding event; assert fils-exact equality against the hand-computed expected value, and that it differs (by rounding) from a naive two-step burden-then-L composition — proving the order rule is enforced.
- Fils-exact; no floats in the multiplier path (use micro-fixed-point like the rest of the engine).
- **Phase-A backtest gate:** run AlSafi/Labs/Omar-Matar with representative conditions; the gate must show the productivity layer does not regress grand-total deviation and improves it on at least one project-type segment. If MCAA helps MEP but not civil, it ships type-scoped.

## 9. Deliverables checklist

- [ ] Seed tables (MCAA, NECA, overtime PI, height, weather, shift) as migrations + firm-editable data.
- [ ] `src/lib/domain/productivity.ts::computeLossMultiplier` (pure, fixed-point, guardrails).
- [ ] `evaluateCostModel` optional `L` param at the productivity step.
- [ ] `quotes.condition_mode` + `condition_input`; `line_items.line_conditions`.
- [ ] Project-settings: MCAA checklist tab + NECA questionnaire tab (mutually exclusive).
- [ ] Per-line height/exposure override on the quote line editor.
- [ ] `L`-breakdown in `line_items.breakdown` + UI "why did this rate move?" display.
- [ ] Tests + Phase-A backtest run.
