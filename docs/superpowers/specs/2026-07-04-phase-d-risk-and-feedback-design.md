# Phase D — Risk, Maturity & the Generalized Feedback Loop

**Date:** 2026-07-04
**Status:** Design (approved for spec-writing)
**Depends on:** Phase A (gate + outturn ground truth), Phase B (estimate class, geometry), Phase C (productivity norms to correct)
**Parent:** `2026-07-04-accuracy-program-roadmap.md`

---

## 1. Purpose

Two things. First, make the estimate **honest**: attach a defensible range and the always-upward optimism correction that bottom-up estimating structurally ignores. Second — and this is the strategic core — **generalize the proven 37%→0% feedback loop from "correct a rate" to "learn every parameter."** The firm's own field data (enriched day-log + closed-job variance) progressively **replaces the seeded industry tables** from Phases B/C with values specific to this firm, this region, these crews. This is what turns a good estimator into a compounding-accuracy engine no competitor can copy — because the data is theirs.

## 2a. Data-model changes (risk parameters)

Follows the **new-table convention (roadmap §7.3)**. `optimism_uplift`/`scope_templates` are firm-editable (UI-table grants); `quotes` columns inherit parent grants. One migration, sorts last.

```sql
alter table quotes
  add column archetype text check (archetype in
    ('standard_building','non_standard_building','standard_civil','non_standard_civil')),  -- null ⇒ no uplift
  add column site_class text check (site_class in
    ('greenfield_clean','average','brownfield_contaminated','poor_ground')),
  add column geotech_done boolean,
  add column contingency_pct numeric,
  add column risk_register jsonb,           -- [{risk, prob, impact}] top 3–5
  add column procurement_route text check (procurement_route in
    ('design_bid_build','design_build','construction_management')),
  add column contract_type text check (contract_type in ('lump_sum','cost_plus','gmp')),
  add column region text;                   -- Phase-B location selection, persisted for the SANITY_BAND key (§5.1)

create table optimism_uplift (
  archetype text, stage int check (stage between 1 and 5), pct numeric not null,
  primary key (archetype, stage)            -- full 4×5 grid, no nulls (see D1)
);
create table scope_templates (
  project_type text primary key,
  required_items jsonb not null             -- array of canonical trade keys, e.g. ["concrete","rebar","blockwork",...]
);
```

`archetype` is a **separate controlled classification** captured on the project-settings form — **not** `projects.project_type`. Null `archetype`/`site_class` ⇒ no uplift / no contingency (identity).

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

- **Where:** `applyOptimismUplift(grandTotalFils)` — a top-level uplift on the rollup total (not per line); the result is the `pointFils` the range anchors to (roadmap §7.2). Reported as part of the range, not silently baked in.
- **Storage:** `optimism_uplift` seeded with the **full 4×5 grid** (no nulls). Anchor the two ends — early-stage (stage 5) = {standard_building 24, non_standard_building 51, standard_civil 44, non_standard_civil 66}; near-award (stage 1) = {6, 6, 4, 4} — and **linearly interpolate** the intermediate stages (5→1, monotone decreasing), rounding to integer %, so the D1 lookup never returns null. `quotes.archetype` + reuse `estimate_class` (Phase B) as `stage`.
- **Learn-don't-ask (target state):** replaced per-firm by the firm's own actual-vs-estimate outturn distribution (§4) — the true reference class.

### D2. Ground / site-condition contingency — P1, per-project
The #1 physical overrun cause; highly right-skewed (rarely helps, often hurts badly). Rehab/refurb estimates are empirically less accurate than new-build.

- **Where:** feeds the P50/P80 contingency (D4); may add a remediation lump sum on groundworks sections.
- **Storage:** `quotes.site_class` + `geotech_done boolean`. Each `site_class` maps to a **single** `contingency_pct` (greenfield_clean 5, average 8, brownfield_contaminated 15, poor_ground 18; +5 if `geotech_done=false`) — the band is guidance; the stored `quotes.contingency_pct` is the one deterministic number the rollup uses (engineer may override).
- **Capture:** two inputs on the project-settings form.

### D3. Scope-completeness cross-check — P1, setup-once
~32% of overruns are estimating errors — chiefly missed/ambiguous scope, always one-directional. A canonical per-project-type WBS/trade template lets the AI **flag omissions** before quoting.

- **Where:** after matching, diff the BOQ's covered trades/sections against the template; emit a new flag `SCOPE_GAP` for missing must-haves.
- **Storage:** `scope_templates(project_type, required_items jsonb)`; engineer supplies the template once per type.
- **Capture:** a one-time template per project type (can seed from a completed tender).

### D4. Contingency policy + P50/P80 range — P2, per-project
AACE bands (Phase B) are only valid if contingency is added to ~50% over/under. This makes the reported range statistically honest (P50/P80 instead of a point).

- **Where:** rollup **extends** `QuoteRollup` with `{p50, p80}` (alongside B7's `{point,low,high,class}`; does not replace the base shape). **Anchoring (roadmap §7.2):** let `pt` = the rollup point **after** the D1 uplift (D1 is the only optimism correction on the central value — P50 does not re-add it). `p50 = pt`; `p80 = roundDivHalfUp(pt × (100 + contingency_pct), 100)` (one rounding, from `quotes.contingency_pct`). B7's `{low, high}` remain the AACE class-band edges around the **same** `pt`, reported alongside (not derived from) `{p50, p80}`. Null `estimate_class` → no `{low,high}` but `{p50,p80}` still emit when `contingency_pct` set; neither set → bare point.
- **Storage:** `quotes.contingency_pct` (default from D2's `site_class` map) + `quotes.risk_register jsonb` (top 3–5 risks).
- **Capture:** contingency % + a tiny risk list. **Deterministic** (class band + flat contingency %) in this phase. A stochastic path (Monte-Carlo over the risk register) is explicitly **out of scope** (roadmap; Phase A §9 lists Monte-Carlo as a non-goal) — if pursued later it gets its own spec.

### D5. Procurement-route / contract-type risk premium — P2, learned
Design-build embeds a design/risk premium; lump-sum draws higher markup than cost-plus/GMP. Direction clear; **magnitude calibrated to the firm, not literature.**

- **Storage:** `quotes.procurement_route` + `contract_type`. **Default = 0 premium until learned** — so the rollup is defined before any firm history exists. Premium bands populate from the D5 `learned_norms` scope (§4) once the firm has closed-job data.

## 3. The day-rate log enrichment — P0, per-project *(the data source)*

**Relationship to existing tables:** `day_log_entries` is **independent of and parallel to** `labor_rates`/`labor_rate_productivity` (which remain the firm-wide day-rate reference — not replaced/deprecated). A day-log row optionally points at the catalog rate that priced it (`labor_rate_id`), giving §5's $/m² band and §7's fils-exact test their monetary source (per-crew-day cost = crew × `labor_rates.day_rate`). The capture UI is a **new per-project crew-day logger** surfaced as a second tab under `/labor-rates` — not an extension of the existing name+day_rate form. Follows the **UI-table convention (roadmap §7.3)**.

```sql
create table day_log_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  labor_rate_id uuid references labor_rates(id),  -- catalog rate that priced this crew-day (nullable)
  trade text not null,                    -- audit label; resolution is via the ids below
  task text,                              -- what was installed (audit label)
  cost_model_id text,                     -- resolved target (nullable at capture, required before variance)
  component_id text,                      -- the labor component whose productivity this nudges
  date date not null,
  crew_skilled integer not null default 0,
  crew_helpers integer not null default 0,
  hours_worked numeric not null,
  quantity_installed numeric not null,
  unit_canonical text not null,           -- constrained to the canonicalUnit enum (normalized on capture)
  temp_c numeric,
  weather text,                           -- clear/rain/heat
  shift text,                             -- day/second_night/third
  overtime_hours numeric default 0,
  rework_quantity numeric default 0,      -- redo qty — the empirical rework signal
  notes text,
  created_at timestamptz default now()
);
```

Derived per row: `hr_per_unit = hours_worked / (quantity_installed − rework_quantity)`. This is the raw material for learning every Phase-C multiplier empirically.

**§3.1 Resolution & keying (a day-log row → a specific cost-model component).** A row has no match tags, so it can't use `matchLine`. **Required path:** the capture UI resolves `cost_model_id` + `component_id` — the engineer picks trade → cost model → its labor component from the same catalog the matcher uses (`trade`/`task` free text stays an audit label). **Fallback:** route free-text `trade`+`task`+`unit_canonical` through the semantic matcher; if a model has **>1** labor component the row is **unresolved and skipped** (logged, never guessed). **Unit check:** the variance job asserts the row's `unit_canonical` equals the resolved `CostModel.unit`; mismatches are **dropped and counted** (never silently averaged). A row that doesn't resolve to exactly one `(cost_model_id, component_id)` is dropped into an "unresolved day-log" coverage metric.

## 4. The variance loop — P0, learned *(the compounding engine)*

Runs as a **CLI batch job** — `npm run variance` (`scripts/variance.ts`, `import './_env'` first, `serviceClient()`, CLI node like `pipeline`/`backtest`). **Never** a DB trigger or `pg_cron` (keeps math in integer-fils TypeScript). Idempotent/re-runnable: each run reprocesses accumulated `day_log_entries` and recomputes `learned_norms` (from scratch, or since a high-water mark). It is **day-log-driven** — no `projects.status`/close column is invented.

**§4.1 Variance update — exact formula** (integer-fils, no floats). Recency-weighted EWMA:

```
new_value = round( (1 − alpha) × prev_value  +  alpha × actual )      // single roundDivHalfUp, micro-fixed-point
  alpha = 0.30                    // exported constant
  prev_value = learned_norms.value if sample_size > 0, else the seed prior
increment sample_size; set updated_at
```

**Seed→learned handover:** `learned_norms` overrides the seed **only once `sample_size ≥ CONFIDENCE_THRESHOLD = 5`** (exported constant); below 5 the estimator uses the seed and ignores the accumulating learned value. Both constants apply uniformly to every scope (including the sub-reliability decaying-average — same `alpha`).

**§4.2 `learned_norms` registry + pricing injection.** This table is **CLI-written (variance job, `serviceClient`) but session-read (the `reprice` action)** — it follows the **third grant bucket in roadmap §7.3**: RLS on; `grant all` to `postgres, service_role`; `grant select to authenticated` + an `authenticated select` policy; `revoke all from anon` (no `authenticated` write policy).

```sql
create table learned_norms (
  scope text not null,
  key text not null,
  value numeric not null,
  sample_size integer not null default 0,
  updated_at timestamptz default now(),
  primary key (scope, key)
);
```

Keys via a shared `normKey(scope, parts)` helper:

| scope | key | value |
|---|---|---|
| `productivity` | `<trade>:<costModelId>:<componentId>` | productivityPerDay |
| `crew_skill` | `<trade>` | multiplier |
| `rework` | `<trade>` | rework fraction |
| `condition` | `<axis>` (`mcaa:<factorKey>`, `neca:<rowKey>`, `height:<band>`, `weather:<exposure>`, `shift:<type>`, `overtime:<hrs>:<wk>`) | uplift % |
| `optimism` | `<archetype>:<stage>` | uplift % |
| `sub_reliability` | `<subId>` | score |
| `sanity_band` | `<projectType>:<region>:<trade>` (and `:__total__`) | $/m² |

**Injection (never mutates `skill_versions` — roadmap §8 immutability):** learned norms **shadow at read time** as override transforms. Extend the project override object with `learnedProductivity?: Record<'<trade>:<costModelId>:<componentId>', string>` and add `applyLearnedProductivity` (or fold into `applyModelOverrides`) that substitutes `productivityPerDay` **before** `evaluateCostModel` (absent = current behaviour). Condition/optimism/rework/sanity norms are read at their existing pipeline slots (Phase-C composer, D1 uplift, D4 contingency, D-§5 band).

**§4.3 Day-log → outturn `golden_lines` bridge** (feeds Phase-A `actual-outturn`; the headline §7 loop-reduces-error test needs this data path):
1. **Case↔project link:** `golden_cases.project_id` (added in Phase A §4) ties a built job's day-log to a scored case.
2. **Alignment:** map each `day_log_entry` to a `golden_line` by resolved trade + `task`↔`description_original` (reuse Phase-A §6 description-similarity), aggregating all crew-days per line; uncovered lines are omitted and **reported as coverage gaps**, never zero-filled.
3. **hr/unit → fils:** `truth_rate_fils` = the same integer-fils cost-engine composition but with field-observed `hr_per_unit` (rework-excluded) and the project's actual day-rate/material/markup: `labor_fils = roundDivHalfUp(day_rate_fils_per_hour × Σhours, Σ(quantity_installed − rework))` + material/equipment/markup exactly as `evaluateCostModel` does.
4. **Build step:** extend `golden:build` with `--outturn --project <id>`, writing rows with `truth_source='actual-outturn'`.

*(The norm-learning loop itself — hr/unit vs hr/unit — is demonstrable **without** this bridge; schedule the bridge as the final Phase-D item.)*

## 5. Cost-per-finished-unit sanity band — P1, learned
The senior estimator's final gut-check, automated: total $/m² and each trade's % share vs the firm's regionally-adjusted historical band.

- **Where:** post-rollup validation; new flag `SANITY_BAND` on outliers.
- **Storage:** `learned_norms` scope=`sanity_band` (§4.2) + existing `ratioChecks`.

## 5.1 New flag codes (`SCOPE_GAP`, `SANITY_BAND`)

Add both to the `FlagCode` union in `types.ts`.

- **`SCOPE_GAP`** — severity `warning`; project-level. After matching, diff the priced BOQ's covered trades against the case's `scope_templates.required_items`; "covered" = a required trade key appears in ≥1 line resolving to it. Emit **one flag per absent required trade**, carrying `required_items: string[]`.
- **`SANITY_BAND`** — severity `warning`; per-trade + one project-total check. Band lookup: `learned_norms` scope=`sanity_band`, key `${projectType}:${region}:${trade}` (and `:__total__`); threshold **> 15%** relative deviation. **`region`** is the Phase-B location selection — persist it as a named `quotes.region text` column (added in this phase's migration) rather than digging it out of `overrides.locationFactor`, so the key is stable; if `region` is null, fall back to `${projectType}:*:${trade}`. If `quotes.gross_floor_area_m2` is null, **skip all $/m² checks** (no flag, no null-divide) — %-share checks may still run. If no matching band exists (below confidence), skip silently.

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

- **Day-log derivation:** `hr_per_unit` excludes rework; a mismatched-unit row is dropped (§3.1); a resolved row nudges exactly that `(costModelId, componentId)` productivity.
- **Variance update (§4.1):** with seed 10.0 and actuals `[12, 11, 13, 12]` at `alpha=0.30` → the exact fils sequence; reads the seed at `sample_size = 4`, switches to learned at `5` (`CONFIDENCE_THRESHOLD`). Deterministic, fils-exact.
- **Injection:** `applyLearnedProductivity` substitutes `productivityPerDay` before `evaluateCostModel`; `skill_versions` content is never mutated.
- **P50/P80 anchoring (§D4):** `p50 == pt` (post-D1 uplift); `p80 == pt × (1 + contingency%)` single-rounded; `{low,high} ==` class-band edges around the same `pt`; fils-exact.
- **Flags:** `SCOPE_GAP` fires for a known-missing required trade; `SANITY_BAND` skips when GFA is null (no null-divide).
- **Outturn conversion (§4.3):** hr/unit → `truth_rate_fils` matches a hand-computed fils value.
- **Phase-A integration (the payoff):** link a built case via `golden_cases.project_id`, build `--outturn`, run `npm run variance`, re-score — assert the learned norms move the estimate **toward** outturn (error demonstrably reduced). The headline claim, now testable.

## 8. Deliverables checklist

- [ ] Migration (sorts last): `quotes` risk columns + `region` (+ CHECKs), `optimism_uplift` (full 4×5 seed grid), `scope_templates` (≥1 seed row, e.g. `building` → required trades), `day_log_entries` (+ resolution/`labor_rate_id` columns, UI-table grants), `learned_norms` (CLI-written/session-read grant bucket, roadmap §7.3).
- [ ] `SCOPE_GAP`, `SANITY_BAND` added to `FlagCode` (`types.ts`) + their checks.
- [ ] Rollup: `applyOptimismUplift` + `applyEstimateBand` (Phase B) + P50/P80, in the roadmap §7.2 order, anchored to `pt`.
- [ ] `applyLearnedProductivity` (or fold into `applyModelOverrides`) — non-mutating read-time shadow; seed-fallback below `CONFIDENCE_THRESHOLD`.
- [ ] Crew-day logger UI (2nd tab under `/labor-rates`) with catalog resolution (§3.1); `unit_canonical` normalized on capture.
- [ ] `scripts/variance.ts` (`import './_env'`, `serviceClient`) — batch, idempotent, integer-fils; `alpha`/`CONFIDENCE_THRESHOLD` exported constants.
- [ ] `golden:build --outturn --project <id>` bridge (§4.3) — **final Phase-D item**.
- [ ] Tests (above), incl. the "loop reduces error toward outturn" integration test.
