# Accuracy Program — Roadmap

**Date:** 2026-07-04
**Status:** Design (approved for spec-writing)
**Goal:** Push the AI estimator from "proven on 2 BOQs" toward near-100% accuracy on real (non-ideal) sites by capturing the data that experienced engineers use but the model does not yet see.

---

## 1. Where we are

The estimator works and its core thesis is proven. On AlSafi, correcting **only** the rate library (2018 → current) moved accuracy from 15% → 66% within ±10% and median error from 37% → 0% — with the matching engine unchanged. Accuracy is bounded by **data**, not intelligence.

The current pricing formula (`src/lib/domain/cost-engine.ts`) is:

```
rate = (material + waste + labor + equipment) × (1 + markup)
       labor    = day_rate ÷ productivity_per_day
       material includes wastePct
```

Everything is deterministic integer-fils arithmetic. The LLM only tags and matches; it never computes a rate.

## 2. The core insight

**The rate is condition-neutral and context-free.** It is a textbook rate for an ideal site. The gap between textbook productivity and what a crew actually achieves on *this* job — congested, at height, in summer, on overtime, first-of-type — is the single largest remaining source of error after stale rates (which we've already solved).

Closing that gap means adding three layers the model lacks today:

1. a **productivity-modifier layer** (conditions → multiplier on productivity),
2. a **project-context layer** (location, size, height, maturity → whole-estimate shifters),
3. a **risk/maturity layer** (turns a false-precise point into an honest range and applies the always-upward optimism correction).

And then **generalizing the proven feedback loop** from "correct a rate" to "learn every parameter from the firm's own field data," so seeded industry tables are eventually replaced by the firm's real numbers.

## 3. The three altitudes (design principle)

Accuracy lives at three capture altitudes. **Almost nothing belongs per-BOQ-line.**

| Altitude | What lives here | Capture UX |
|---|---|---|
| **Setup-once (firm constant)** | labor burden %, overhead %, per-material waste defaults, canonical scope templates | Settings screen, set once, rarely changed |
| **Per-project (bid-time judgment)** | location factor, GFA/storeys/height, estimate class, MCAA factors, NECA questionnaire, OT/weather/height, reference-class uplift, ground conditions | One project settings form + one scored questionnaire, filled once per quote |
| **Learned-from-feedback** | crew-skill multiplier, rework rate, optimism-uplift magnitude, sub reliability, per-trade productivity norms | Never asked — derived from the enriched day-log and closed-job variance |
| **Per-BOQ-line (rare)** | working height, indoor/outdoor exposure — only genuinely line-varying things | Optional dropdown on a line; inherits project default |

This matches how estimators actually work: assess the job once at bid time, not line by line.

## 4. The five-category parameter model

Derived from a verified research sweep (MCAA "Factors Affecting Labor Productivity", NECA Manual of Labor Units, AACE 18R-97 estimate classes, RSMeans location/size factors, Flyvbjerg/Mott MacDonald reference-class forecasting). Values adversarially verified; treated as **seed defaults that the feedback loop replaces per-firm.**

- **A — Rate-recipe completion.** Labor **burden %** (bare day-rate omits 25–40% true labor cost — a systematic under-estimate on every line), split `markupPct` into **overhead % + profit %**, per-material waste defaults.
- **B — Productivity modifiers.** MCAA 16-factor loss checklist, NECA-style scored condition questionnaire, overtime fatigue curve, working-height/floor bands, weather/season, shift, learning curve.
- **C — Project/context modifiers.** Location factor (0.80–1.35×), GFA/storeys/storey-height (the dominant cost predictors), size economies-of-scale, project type/complexity, quality grade, time index (base-rate date → tender date), structural/foundation system.
- **D — Risk & maturity.** Estimate class (AACE) → ± band, reference-class/optimism uplift, ground/site-condition contingency, scope-completeness cross-check, contingency policy, procurement-route risk premium.
- **E — Feedback signals.** Day-log enrichment (crew composition + conditions-on-the-day + rework flag), actual-vs-estimated variance loop, cost-per-finished-unit sanity band, subcontractor reliability score.

Full per-parameter detail (impact, quantification, capture mode, priority) lives in the phase specs.

## 5. Phase sequence

Every phase is independently shippable and raises accuracy on its own. **Phase A is a prerequisite** — it makes "does this parameter help?" a measured fact, not an assumption.

### Phase A — Backtest harness *(prerequisite; from existing backlog)*
Golden set built from the real priced↔unpriced BOQ pairs already on disk (Omar Matar, Fountain Square, AlSafi, Labs, JAH_Amman hospital, Karak, mosque). Dual ground truth: **priced-tender now, actual-outturn as the day-log accrues**. `npm run backtest` scores % within ±5/10/20%, per-trade and grand-total deviation, **segmented by project type**. Provides the **regression/A-B gate** every later parameter must pass before it ships.
→ `2026-07-04-phase-a-backtest-harness-design.md`

### Phase B — Rate-recipe completion & context modifiers *(P0 quick wins)*
Category A + the cheapest of C. Labor burden, overhead/profit split, per-material waste, location factor, GFA/storeys/height, estimate-class → ± band. Mostly firm-constants or single per-quote fields threaded through the existing `overrides` machinery. Establishes the "project settings" surface later phases extend.
→ `2026-07-04-phase-b-recipe-and-context-design.md`

### Phase C — Productivity-modifier layer *(the big accuracy block)*
Category B. The condition→multiplier engine: MCAA 16-factor checklist **or** NECA scored questionnaire (two **mutually-exclusive** project-baseline modes — never stacked), layered with per-line overrides (working height, exposure). Seeded lookup tables. Inserts one multiplier at the productivity step in `cost-engine.ts`.
→ `2026-07-04-phase-c-productivity-layer-design.md`

### Phase D — Risk, maturity & generalized feedback loop
Categories D + E. Reference-class uplift, ground-conditions contingency, day-log enrichment, and the actual-vs-estimated variance loop that **retires the seeded tables** in favour of the firm's own numbers. Closes the compounding-accuracy engine.
→ `2026-07-04-phase-d-risk-and-feedback-design.md`

## 6. Program-wide guardrails (from verification)

- **MCAA percentages are additive, not multiplicative.** Sum the chosen factors' %; do not compound them.
- **Default to minor/average, cap ~4 factors, never auto-apply "severe."** The published %s are contractor opinion (a starting point), and courts never award "severe."
- **Keep shift/OT *wage premium* strictly separate from shift/OT *productivity loss*.** They are different cost lines; conflating them double-counts.
- **Apply size/economy multipliers to fixed/bulk components, not uniformly to labor.**
- **Tag every base rate with its reference location and date** so location and time factors apply *relative to the base* and are never double-counted.
- **Prefer one scored per-project questionnaire over many per-line fields.** Per-line inputs are reserved for genuinely line-varying things.
- **Every new parameter must pass the Phase-A gate** (net-improve, or at least not regress, the golden set) before it becomes a default.

## 7. The authoritative transform pipeline

**This is the single canonical ordering. Phases B/C/D reference it; none re-declares its own.** Because the engine is integer-fils with `roundDivHalfUp` at each step, **order is observable** (rounding differs by order), so it is fixed here and locked by fils-exact tests.

**Snapshot transforms** (price-level, in order):
`applyPriceOverrides` → `applyTimeIndex` (B8) → `applyLocationFactor` (B4, labor+material separately) → `applyLaborBurden` (B1) → `applyLaborPremium` (existing).

**Per-model transforms:**
`applyModelOverrides` (B2 waste + overhead/profit) → `applySizeFactor` (B6, fixed components only).

**Per-line, at pricing:**
compute `L` (C: productivity loss multiplier) → `evaluateCostModel(model, snapshot, L)`.

**Critical single-rounding rule (B1 × C):** burden adjusts *price*, `L` adjusts *productivity*, and they are combined in **one** rounded division, not two sequential ones:
```
labor = roundDivHalfUp( price × (1+burden) × MICRO , productivity / L )
```
One `roundDivHalfUp`, one rounding event. A fils-exact test locks this.

**Rollup:**
`evaluateCostModel` per line → rollup sum → reference-class uplift (D1) → contingency/range → estimate-class ± band (B7) / P50-P80 (D4). These **extend** the current `QuoteRollup { grandTotalFils, sections[] }` with new fields (`point/low/high/class`, `p50/p80`) — they do not replace it, so existing `checkRatios`/`validateRollup` consumers are unaffected.

## 8. Invariants preserved across all phases

- Integer-fils arithmetic; no floats; the LLM never computes a rate.
- Trade-skill versions remain immutable; every quote pins its price snapshot + skill versions.
- New modifiers are **additive transforms** in the existing `overrides` pipeline or new dated/versioned tables — never in-place mutation of history.
- The transform order in §7 is authoritative and fils-exact-tested; specs never redeclare it.
- Arabic-first RTL UI; every AI response Zod-validated.
- Each phase spec is self-contained and gets its own review + plan + implementation cycle.

## 9. Success criteria for the program

- The backtest gate exists and runs on real BOQs, segmented by project type.
- Each shipped parameter demonstrably narrows the error distribution on the golden set (or is dropped).
- The estimate reports an **honest ± range**, not a false-precise point.
- Over closed jobs, the feedback loop measurably tightens per-trade norms — seeded tables give way to firm-specific values.
