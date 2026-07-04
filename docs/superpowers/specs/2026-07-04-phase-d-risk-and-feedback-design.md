# Phase D — Risk, Maturity & the Generalized Feedback Loop

**Date:** 2026-07-04
**Status:** Design (approved for spec-writing)
**Depends on:** Phase A (gate + outturn ground truth), Phase B (estimate class, geometry), Phase C (productivity norms to correct)
**Parent:** `2026-07-04-accuracy-program-roadmap.md`

---

## 1. Purpose

Two things. First, make the estimate **honest**: attach a defensible range and the always-upward optimism correction that bottom-up estimating structurally ignores. Second — and this is the strategic core — **generalize the proven 37%→0% feedback loop from "correct a rate" to "learn every parameter."** The firm's own field data (enriched day-log + closed-job variance) progressively **replaces the seeded industry tables** from Phases B/C with values specific to this firm, this region, these crews. This is what turns a good estimator into a compounding-accuracy engine no competitor can copy — because the data is theirs.

## 2. Risk & maturity parameters

### D1. Reference-class / optimism-bias uplift — P1, per-project *(the 37%→0% loop, made explicit)*
Bottom-up estimates are systematically low; the correction is always upward and shrinks as design matures. Seed uplifts (Mott MacDonald / HM Treasury) by archetype × stage:

| Archetype | Early-stage uplift |
|---|---|
| Standard buildings | 24% |
| Non-standard buildings | 51% |
| Standard civil | 44% |
| Non-standard civil | 66% |

Shrinking to ~2–6% near award. **This *is* what the acceptance test discovered empirically** — here it becomes an explicit, per-firm, learnable parameter.

- **Where:** a top-level uplift on the rollup total (not per line), reported as part of the range.
- **Storage:** seed `optimism_uplift(archetype, stage, pct)`; `quotes.archetype` + reuse `estimate_class` (Phase B) as the stage proxy.
- **Learn-don't-ask (target state):** replaced per-firm by the firm's own actual-vs-estimate outturn distribution (§4) — the true reference class.

### D2. Ground / site-condition contingency — P1, per-project
The #1 physical overrun cause; highly right-skewed (rarely helps, often hurts badly). Rehab/refurb estimates are empirically less accurate than new-build.

- **Where:** widens contingency on excavation/foundation/groundworks sections; may add a remediation lump sum.
- **Storage:** `quotes.site_class` (greenfield-clean / average / brownfield-contaminated / poor-ground) + `geotech_done boolean` → contingency band (clean 5–10%, brownfield/unknown 10–20%).
- **Capture:** two inputs on the project-settings form.

### D3. Scope-completeness cross-check — P1, setup-once
~32% of overruns are estimating errors — chiefly missed/ambiguous scope, always one-directional. A canonical per-project-type WBS/trade template lets the AI **flag omissions** before quoting.

- **Where:** after matching, diff the BOQ's covered trades/sections against the template; emit a new flag `SCOPE_GAP` for missing must-haves.
- **Storage:** `scope_templates(project_type, required_items jsonb)`; engineer supplies the template once per type.
- **Capture:** a one-time template per project type (can seed from a completed tender).

### D4. Contingency policy + P50/P80 range — P2, per-project
AACE bands (Phase B) are only valid if contingency is added to ~50% over/under. This makes the reported range statistically honest (P50/P80 instead of a point).

- **Where:** rollup **extends** `QuoteRollup` with `{p50, p80}` (alongside B7's `{point,low,high,class}`; does not replace the base shape) using the class band + a short risk register.
- **Storage:** `quotes.contingency_pct` + `quotes.risk_register jsonb` (top 3–5 risks, rough prob/impact).
- **Capture:** contingency % (from the maturity matrix) + a tiny risk list. **Deterministic** (class band + flat contingency %) in this phase. A stochastic path (Monte-Carlo over the risk register) is explicitly **out of scope for now** — Phase A §9 lists Monte-Carlo as a non-goal; if pursued later it gets its own spec. Do not build the stochastic engine as part of D4.

### D5. Procurement-route / contract-type risk premium — P2, learned
Design-build embeds a design/risk premium; lump-sum draws higher markup than cost-plus/GMP. Direction clear; **magnitude calibrated to the firm, not literature.**

- **Storage:** `quotes.procurement_route` + `contract_type` → preset premium bands, tuned from the firm's bid/outturn history.

## 3. The day-rate log enrichment — P0, per-project *(the data source)*

The existing `labor_rates` / `labor_rate_productivity` tables are a simple day-rate log. Enrich each **crew-day** into a real `hr/unit` datapoint tagged by *who* worked and *under what conditions* — separating "the crew is slow" from "the day was bad."

```sql
create table day_log_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  trade text not null,
  task text,                              -- what was installed
  date date not null,
  crew_skilled integer not null default 0,
  crew_helpers integer not null default 0,
  hours_worked numeric not null,
  quantity_installed numeric not null,
  unit text not null,
  -- conditions on the day (mirror the Phase-C modifier axes so we can attribute variance):
  temp_c numeric,
  weather text,                           -- clear/rain/heat
  shift text,                             -- day/2nd/3rd
  overtime_hours numeric default 0,
  rework_quantity numeric default 0,      -- redo qty — the empirical rework signal
  notes text,
  created_at timestamptz default now()
);
```

Derived per row: `hr_per_unit = hours_worked / (quantity_installed - rework_quantity)` and a productivity `units/day`. Tagged by crew composition and conditions → this is the raw material for learning every Phase-C multiplier empirically.

## 4. The variance loop — P0, learned *(the compounding engine)*

The meta-datum that makes everything self-correcting. On job close (or continuously from the day-log):

```
variance = (actual_hr_per_unit − estimated_hr_per_unit) / estimated_hr_per_unit
```

- **Per-trade productivity norms:** nudge the stored `productivityPerDay` via a weighted moving average of actuals. Each closed job tightens the norm. This directly retires textbook constants.
- **Crew-skill multiplier:** regress `hr_per_unit` on crew skill mix (skilled:helper ratio) → derive the firm's real 0.85–1.2 range instead of asking a subjective per-line number.
- **Rework rate:** aggregate `rework_quantity / quantity_installed` per trade × crew → an empirical rework allowance, replacing a guessed %.
- **Weather/OT/height effects:** with conditions tagged on each day-log row, attribute variance to condition axes → the firm's *own* MCAA/NECA-equivalent values, replacing seed tables.
- **Optimism-uplift magnitude (D1):** accumulate the firm's actual-vs-estimate distribution → the true reference class per archetype.
- **Subcontractor reliability score:** decaying-average from closed-job outcomes (on-time? rework? coordination burden?) → an auto-suggested premium at bid time.

**Storage:** a `learned_norms(scope, key, value, sample_size, updated_at)` table — the firm's evolving parameter set. Seed tables provide priors; `learned_norms` overrides them once `sample_size` crosses a confidence threshold. The estimator reads `learned_norms` first, seed second.

**This closes the ground-truth loop with Phase A:** day-log actuals become the `actual-outturn` truth source the backtest harness was built to accept. The system scores itself against reality and tightens.

## 5. Cost-per-finished-unit sanity band — P1, learned
The senior estimator's final gut-check, automated: total $/m² and each trade's % share vs the firm's regionally-adjusted historical band. Flag any line/trade >15% off. Cheap — computed from data already present; extends the existing rate `band` and `ratioChecks`.

- **Where:** post-rollup validation; new flag `SANITY_BAND` on outliers.
- **Storage:** derived from `learned_norms` ($/m² by project type/region) + existing `ratioChecks`.

## 6. What gets asked vs learned (final placement)

| Learned (never asked) | Asked once per project |
|---|---|
| per-trade productivity norms | archetype + estimate class (stage) |
| crew-skill multiplier | site class + geotech done? |
| rework rate | contingency % + top risks |
| condition-effect magnitudes (firm's own MCAA/NECA) | procurement route + contract type |
| optimism-uplift magnitude | *(day-log entries during execution — not at bid time)* |
| sub reliability score | |
| $/m² sanity bands | |

## 7. Testing

- Day-log derivation: `hr_per_unit` excludes rework; fils/fixed-point exact.
- Variance update: weighted-average nudge is deterministic; seed→learned handover respects the confidence threshold; a norm with `sample_size` below threshold still uses the seed.
- Optimism uplift and contingency: rollup emits correct P50/P80 for given class + register.
- Scope gap: template diff flags a known-missing trade.
- **Phase-A integration (the payoff):** feed a case's actual-outturn as `truth_source='actual-outturn'`, run the variance loop, re-score — assert the learned norms move the estimate toward outturn (the loop demonstrably reduces error). This is the program's headline claim, now testable.

## 8. Deliverables checklist

- [ ] `day_log_entries` (enriched log) + capture UI (extends `/labor-rates`).
- [ ] `learned_norms` table + read-seed-fallback in the estimator.
- [ ] Variance loop job: day-log/closed-job → norm updates (productivity, crew, rework, conditions, optimism, sub score).
- [ ] Seed tables: `optimism_uplift`, `scope_templates`; `quotes` risk columns.
- [ ] Rollup range: reference-class uplift + contingency → P50/P80; `estimate_class` band from Phase B.
- [ ] New flags: `SCOPE_GAP`, `SANITY_BAND`.
- [ ] Wire day-log actuals as Phase-A `actual-outturn` truth source.
- [ ] Tests, incl. the "loop reduces error toward outturn" integration test.
