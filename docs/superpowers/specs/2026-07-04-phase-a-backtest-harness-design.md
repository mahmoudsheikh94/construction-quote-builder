# Phase A — Backtest Harness

**Date:** 2026-07-04
**Status:** Design (approved for spec-writing)
**Depends on:** nothing (prerequisite for B/C/D)
**Parent:** `2026-07-04-accuracy-program-roadmap.md`

---

## 1. Purpose

Make "does this parameter improve accuracy?" a **measured fact**, not an assumption. Every parameter added in Phases B/C/D must pass through this harness: it either narrows the error distribution on real BOQs or it does not ship as a default. This turns the whole program from "innovate on parameters" into "prove each parameter earns its place."

This is the existing Phase-4 backlog item (golden-set builder + scoring + regression gate), specified concretely against the real files on disk.

## 2. Ground truth — dual, per the roadmap

| Source | Availability | Meaning | Use |
|---|---|---|---|
| **Priced tender** | Now (files on disk) | "What that estimator quoted" | Primary scoring source today; matches the acceptance test |
| **Actual outturn** | Accrues via Phase D day-log | "What the job actually cost when built" | The real target; layered in as closed jobs accumulate |

A golden case carries an explicit `truthSource: "priced-tender" | "actual-outturn"` so scores are never silently mixed. Outturn, when present for a case, is preferred; the harness reports both and never averages across truth sources.

## 3. The golden set — real files

**Scored cases (confirmed priced↔unpriced pairs)** — these have ground truth today and are the Phase-A deliverable:

| Case | Priced (truth) | Unpriced (input) | Project type |
|---|---|---|---|
| Omar Matar | `Package 8 & 9 B Omar Matar Street with price.pdf`, `Package 9 A Structural & MEP Works priced.pdf`, `Package 9A Architectural Works priced.pdf` | `Omar Matar Street without price.pdf` | Civil + MEP + Architectural |
| AlSafi | `alsafi-priced.xlsx` / `-v2` | `reference-docs/test-boqs/AlSafi_Civil.xlsx` | Civil |
| Labs | `labs-priced.xlsx` / `-v2` | `reference-docs/test-boqs/Labs.xlsx` | Labs/fit-out |

**Candidate cases (no truth yet — NOT Phase-A deliverables)** — registered with `truth_source='none'`, excluded from scoring until a priced counterpart is supplied:

| Case | Unpriced (input) | Project type | Blocked on |
|---|---|---|---|
| JAH Amman | `reference-docs/test-boqs/JAH_Amman.xlsx` | Hospital (1562 lines) | priced version to be located |
| Fountain Square | `Fountain Square Bill 1 & 2 without price.pdf`, `Fountain Square Station without price.pdf` | Infrastructure | priced counterpart when available |

The scored set (Omar Matar, AlSafi, Labs) is what Phase A ships against; candidates promote to scored the moment a price is supplied.

**Segmentation matters:** with pairs across civil / MEP / architectural / hospital / infrastructure, accuracy can be reported *by project type*, not just as one blended number. This is what lets us see that (e.g.) a height modifier helps MEP but not groundworks.

## 4. Data model

New tables (new migration, RLS: authenticated r/w, anon denied, consistent with existing policy):

```sql
-- A registered scoring case: an unpriced BOQ + its ground-truth priced counterpart
create table golden_cases (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,              -- "omar-matar-9a-structural"
  name_ar text not null,
  project_type text not null,             -- for segmentation
  input_path text not null,               -- unpriced BOQ (relative repo path or storage ref)
  profile_slug text not null,             -- which project-type profile to price with
  truth_source text not null check (truth_source in ('priced-tender','actual-outturn','none')),
  created_at timestamptz default now()
);

-- The ground-truth rate/amount for each line of a case (parsed from the priced doc once)
create table golden_lines (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references golden_cases(id) on delete cascade,
  sort_order integer not null,
  item_code text,
  description_original text not null,
  unit_canonical text,
  quantity_thousandths bigint,
  truth_rate_fils bigint,                 -- the priced/outturn unit rate
  truth_amount_fils bigint,
  trade text,                             -- resolved trade, for per-trade scoring
  created_at timestamptz default now()
);

-- One scoring run of one case under one config (skill versions + overrides snapshot)
create table backtest_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references golden_cases(id) on delete cascade,
  label text,                             -- "baseline", "with-burden", "with-mcaa"
  config jsonb not null,                  -- {skillVersions, overrides, asOf} — what made this run reproducible
  scored_at timestamptz default now(),
  summary jsonb not null                  -- {within5,within10,within20, medianErr, grandTotalDev, byTrade:{...}}
);
```

Line-level results can live in `backtest_runs.summary.lines[]` (JSONB) rather than a fourth table — a run is analysed as a whole, not queried per line. Keep it in JSONB to avoid schema churn while metrics evolve.

## 5. Golden-line ingestion

Reuse the **existing ingest pipeline** — it already reads these exact file shapes:
- Excel priced BOQs → `src/lib/ingest/excel.ts` (already handles multi-sheet, header detection, Arabic/English dialects). Add a **priced-column reader** (currently price columns are *excluded* from mapping; the harness needs to *read* them into `truth_rate_fils`/`truth_amount_fils`). This is a read-only additive capability behind a flag — normal ingestion still excludes prices.
- PDF priced BOQs → `src/lib/ingest/pdf.ts` (Claude vision). Same, with a priced-column extraction prompt variant.

Ingestion is a **one-time build step per case** (`npm run golden:build -- --case <slug>`), not part of scoring. Parsed truth is persisted to `golden_lines`; scoring never re-parses the priced doc.

## 6. Scoring engine

New: `src/lib/backtest/score.ts` (pure, deterministic, integer-fils — no AI, no floats).

Given a priced quote (from `runPipeline`) and the case's `golden_lines`:

1. **Align** priced lines to golden lines by `(sort_order, item_code)` then description similarity fallback. Report unmatched lines both ways (coverage %).
2. **Per-line error** = `(estimated_rate − truth_rate) / truth_rate`. Only lines that both matched *and* were priced (not `NO_MATCH`/`NEEDS_MANUAL`) count toward rate accuracy; the rest count toward **coverage**, reported separately.
3. **Distribution metrics:** % of priced lines within ±5 / ±10 / ±20 %; **median absolute error**; mean signed error (bias direction — is the AI systematically high or low?).
4. **Grand-total deviation** = `(Σ estimated_amount − Σ truth_amount) / Σ truth_amount`. This is what the contractor ultimately cares about; a quote can have high line scatter but a good total, or vice-versa.
5. **Per-trade breakdown:** the same metrics grouped by `golden_lines.trade`, so we see which trades are accurate and which drag.
6. **Per-project-type breakdown:** aggregate across cases of the same `project_type`.

Metrics mirror the acceptance test (which used within ±10% / ±25% / median) so historical results stay comparable.

## 7. CLI

```
npm run backtest                          # score every case, print a table + write backtest_runs
npm run backtest -- --case omar-matar-9a  # one case
npm run backtest -- --label with-burden   # tag the run for A/B comparison
npm run backtest -- --compare baseline with-burden   # diff two labelled runs
```

`--compare` prints the delta per metric per trade per project-type, and a verdict: **improved / regressed / neutral** on each segment. This is the A/B gate.

Runs against the shared cloud DB via `serviceClient()` (CLI node, like the existing pipeline), never from the browser.

## 8. The regression / A-B gate

The deliverable that makes the program disciplined:

- **Baseline run** is stored once (current estimator, no new parameters).
- Each new parameter (or skill-version activation) is scored as a labelled run and **compared to baseline**.
- **Gate rule:** a parameter becomes a default only if `--compare` shows it does **not regress** grand-total deviation or median error on any project-type segment, and improves at least one. Parameters that only help one project type ship as *type-scoped defaults*, not global.
- This wires into the existing "skill activation" step (Phase-1 design already separates create-version from activate-version precisely to allow backtest gating). Activation can be blocked if the new version scores worse than its predecessor.

## 9. Non-goals for Phase A

- No new estimator parameters (that's B/C/D). Phase A only *measures*.
- No stochastic/Monte-Carlo scoring (deterministic point comparison only; ranges come in Phase D).
- No UI — CLI + persisted `backtest_runs` is enough; a dashboard can come later.

## 10. Testing

- Unit-test `score.ts` against hand-built tiny fixtures (2–3 lines, known truth) → known metrics. Deterministic, no AI.
- Unit-test line alignment (exact match, code-only match, description-fallback, unmatched-both-ways).
- Integration: build one small real case (AlSafi), run `npm run backtest -- --case alsafi`, assert the summary reproduces the acceptance-test numbers (66% within ±10%, median 0% on the corrected-rate config) — a regression test on our own headline result.
- Fils-exact assertions throughout; no float tolerance.

## 11. Deliverables checklist

- [ ] Migration: `golden_cases`, `golden_lines`, `backtest_runs` (+ RLS).
- [ ] Priced-column reader flag in `ingest/excel.ts` and `ingest/pdf.ts`.
- [ ] `npm run golden:build` — parse a case's priced doc → `golden_lines`.
- [ ] `src/lib/backtest/score.ts` — alignment + distribution + per-trade + per-type metrics.
- [ ] `npm run backtest` (+ `--case`, `--label`, `--compare`).
- [ ] Register the confirmed golden cases (Omar Matar, AlSafi, Labs).
- [ ] Store the baseline run.
- [ ] Wire the gate into skill activation.
- [ ] Tests (score unit, alignment unit, AlSafi reproduction integration).
