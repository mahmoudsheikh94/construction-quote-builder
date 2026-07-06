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

A golden case carries an explicit `truth_source` (`'priced-tender' | 'actual-outturn' | 'none'`) and each `golden_lines` row its own `truth_source`, so scores are never silently mixed. Outturn, when present, is preferred; the harness reports both and never averages across truth sources.

## 3. The golden set — real files

> **CRITICAL — the repo-root `*-priced.xlsx` / `*.json` files are PIPELINE OUTPUTS, not truth.** `alsafi-priced.xlsx`, `labs-priced.xlsx` (and `-v2`) are `runPipeline --out` artifacts: they carry a `ملاحظات` (Notes) column of estimator flags (`SEMANTIC_FALLBACK`, `NO_MATCH`, `UNIT_UNKNOWN`, `PRICE_UNIT_MISMATCH`), the estimator's **seeded** rates (e.g. porcelain 11), and `null` rows on unmatched lines. They **must never** be used as golden truth. The human estimator's real prices live in the **`AlSafi_Civil.xlsx`** workbook itself, column E "Unit Price". *(Verified on disk: the header row is "Descriptions | Unit | Qty | Unit Price | Total price"; the "Supply porcelain floor tile … Module area" line carries E=9, the wash-room "Block 10 hollow block wall" line E=8.5, the "Cement plastering 2 coats" line E=5. By contrast `alsafi-priced.xlsx` carries Arabic headers, E=11.000 on the same porcelain line, and a `ملاحظات`=SEMANTIC_FALLBACK flag column — an estimator output, not human truth.)*

So for the Excel cases, **the priced-truth doc and the pipeline input are the SAME workbook** — the priced-column reader reads column E for truth; the pipeline ingests a price-stripped copy so it never sees the answers.

**Scored cases (confirmed human-priced truth on disk)** — Phase-A deliverable:

| Case slug | Priced truth (`priced_path`) | Pipeline input (`input_path`) | Project type |
|---|---|---|---|
| `omar-matar-9b-civil` | `reference-docs/Package 8 & 9 B Omar Matar Street with price.pdf` | `reference-docs/Omar Matar Street without price.pdf` | civil |
| `omar-matar-9a-structural-mep` | `reference-docs/Package 9 A Structural & MEP Works priced.pdf` | `reference-docs/Omar Matar Street without price.pdf` | mep |
| `omar-matar-9a-architectural` | `reference-docs/Package 9A Architectural  Works priced.pdf` *(note: TWO spaces before "Works")* | `reference-docs/Omar Matar Street without price.pdf` | architectural |
| `alsafi-civil` | `reference-docs/test-boqs/AlSafi_Civil.xlsx` (col E) | `reference-docs/test-boqs/AlSafi_Civil.unpriced.xlsx` (a committed copy with cols E "Unit Price" + F "Total price" dropped) | civil |

**Omar Matar is 3 golden cases, not 1.** The one unpriced BOQ (`Omar Matar Street without price.pdf`) is priced once through `runPipeline` and scored **independently** against each of the 3 priced packages' `golden_lines` — no cross-document line merge. Each package is its own `golden_cases` row sharing the same `input_path` but a distinct `priced_path`.

**Candidate cases (no human-priced truth yet — NOT deliverables)** — registered `truth_source='none'`, `priced_path` NULL, excluded from scoring:

| Case slug | Pipeline input | Project type | Blocked on |
|---|---|---|---|
| `labs-fitout` | `reference-docs/test-boqs/Labs.xlsx` | labs | **Labs.xlsx is genuinely unpriced** (empty "السعر الافرادي" column); `labs-priced.xlsx` is only a pipeline output. Needs a human-priced Labs counterpart. |
| `jah-amman` | `reference-docs/test-boqs/JAH_Amman.xlsx` | hospital | priced version to be located |
| `fountain-square` | `reference-docs/Fountain Square Bill 1 & 2 without price.pdf`, `…Station without price.pdf` | infrastructure | priced counterpart |

`project_type` is a **closed enum** (`civil`, `mep`, `architectural`, `labs`, `hospital`, `infrastructure`), enforced by a CHECK on `golden_cases` (§4).

**Segmentation matters:** with scored cases across civil / MEP / architectural, accuracy is reported *by project type*, not one blended number — this is what reveals that (e.g.) a height modifier helps MEP but not groundworks.

## 4. Data model

Three service-role/CLI tables (written only by `serviceClient`, no UI). They follow the **service-role table convention (roadmap §7.3)** — base grants to all roles, `revoke all from anon`, no RLS policies:

```sql
create table golden_cases (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,              -- "omar-matar-9a-structural-mep"
  name_ar text not null,
  project_type text not null check (project_type in
    ('civil','mep','architectural','labs','hospital','infrastructure')),
  input_path text not null,               -- pipeline input; repo-root-relative filesystem path
  priced_path text,                       -- priced-truth doc; NULL iff truth_source='none'
  profile_slug text not null,             -- project-type profile to price with
  project_id uuid references projects(id),-- set for built jobs (Phase-D outturn bridge); nullable
  truth_source text not null check (truth_source in ('priced-tender','actual-outturn','none')),
  created_at timestamptz default now(),
  check ((truth_source = 'none') = (priced_path is null))   -- priced_path present iff scoreable
);

create table golden_lines (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references golden_cases(id) on delete cascade,
  sort_order integer not null,
  item_code text,
  description_original text not null,
  unit_canonical text,
  quantity_thousandths bigint,
  truth_rate_fils bigint,                 -- from priced_path (col E for Excel); NULL if not on the priced doc
  truth_amount_fils bigint,               -- NULL if the priced doc has no amount (never synthesized)
  trade text,                             -- resolved at build time (§5.2); NULL for no-match/non-unit-rate
  truth_source text not null default 'priced-tender',  -- 'priced-tender' | 'actual-outturn'
  created_at timestamptz default now()
);

create table backtest_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references golden_cases(id) on delete cascade,
  label text,                             -- "baseline", "with-burden", "with-mcaa"
  config jsonb not null,                  -- {skillVersions, profileVersionId, overrides, asOf} — pins the run
  scored_at timestamptz default now(),
  summary jsonb not null                  -- see §6; all metrics are signed integer basis points
);

-- Grants (roadmap §7.3, service-role tables): for each of the 3 tables —
grant all on <table> to postgres, anon, authenticated, service_role;
revoke all on <table> from anon;
```

Line-level results live in `backtest_runs.summary.lines[]` (JSONB), not a fourth table — a run is analysed whole. `golden_lines.truth_source` lets a case carry both priced-tender and actual-outturn truth rows without mixing them (§2).

## 5. Golden-line ingestion

`npm run golden:build -- --case <slug>` reads the case's **`priced_path`** (not `input_path`), parses truth into `golden_lines`, and resolves each line's trade. One-time per case; scoring never re-parses. Errors if `priced_path` is NULL while `truth_source != 'none'`.

### 5.1 Priced-column reader — Excel parsing rules

Add `opts.readPrices?: boolean` to `ingestExcel(path, opts)` (default `false` = today's behaviour, prices excluded). When `true`:

1. **Split the price header** currently in `excel.ts` `PRICE_HEADER` into two:
   - `RATE_HEADER = ["سعر الوحدة", "سعر", "unit price", "unit rate", "rate"]` → `truth_rate_fils`
   - `AMOUNT_HEADER = ["المبلغ", "الاجمالي", "الإجمالي", "total price", "total", "amount"]` → `truth_amount_fils`
   - Match rate before amount. If neither maps, skip prices and warn (don't guess).
2. **Read priced cells `raw:true`** as JS numbers via a **new** `parseJDNumberToFils(n: number): number` = `Math.round(n * 1000)` — this absorbs IEEE artifacts (`8.5→8500`, `1.1000000000000001→1100`, `9→9000`). Do **not** use the string-only `parseJDToFils` (its `JD_RE` rejects raw numbers).
3. **Missing amount** → leave `truth_amount_fils` NULL (never synthesize `rate×qty`). **Missing rate but qty present** → optionally derive and tag `rate_derived`, else NULL. **Both NULL** → drop the line, count as coverage only.
4. **Section-header skip:** a row with a description but **no unit AND no qty AND no rate AND no amount** is a header — skip for `golden_lines` even if it has an item_code (e.g. the AlSafi "Porcelain for module area" / "Build Wash rooms - TM" grouping rows, which carry an item_code but no unit/qty/price).
5. Unit test with a 5-row fixture: integer rate, decimal rate, float-artifact rate, blank-amount row, header row.

### 5a. Priced reader contract — PDF + shared

- **Flag:** add `opts.readPrices?: boolean` to **both** `ingestExcel(path, opts)` and `ingestPdf(path, adapter, opts)`; default `false` = unchanged.
- **Return shape:** do **not** widen `RawLine`. Add `PricedRawLine extends RawLine` with `truthRateFils?: number|null`, `truthAmountFils?: number|null`; `readPrices:true` returns `PricedExtractionResult`. Add optional `rateRaw`/`amountRaw` to `RawLineSchema` (PDF) so vision JSON validates.
- **PDF prompt:** define `EXTRACT_SYSTEM_PRICED` — drop the "لا تحسب أي أسعار" instruction; return **verbatim** rate/amount strings into `rateRaw`/`amountRaw`; the model does **no** arithmetic. `golden:build` parses host-side.
- **Shared currency parser** `parsePriceToFils(raw: string): number|null` — the **only** currency-parsing path: Arabic-Indic `٠-٩`→`0-9`; strip currency tokens (`JD`, `د.ا`, `دينار`, `فلس`); `,`/`٬` as thousands, `.`/`٫` as decimal; `×1000` with `roundDivHalfUp`; NULL on unparseable. (Excel uses `parseJDNumberToFils` for raw numbers; PDF uses `parsePriceToFils` for strings.)
- **Build-time guard:** `golden:build` **fails loudly** if the parsed truth doc contains any pipeline-flag column (`ملاحظات`/Notes) or if `> 50%` of `truth_rate_fils` are NULL — this prevents accidentally pointing at a pipeline output artifact.

### 5.2 Resolving `golden_lines.trade`

No trade-resolution fn exists in ingest today. `golden:build` resolves each line's trade by running the **same AI match step the pipeline uses** (`batchTagLines` → `lookupBySignature`/`batchMatchLines` against the case's active profile skills; first catalog match → its trade). Lines with no match or non-unit-rate get `trade = null`. Uses active skills as-of build time; **not** re-run during scoring (`score.ts` reads the persisted `trade`). This makes `golden:build` AI-dependent — acceptable for a one-time build. Only the §6 per-trade breakdown depends on this; the §8 gate segments by `golden_cases.project_type`, which is trade-independent.

## 6. Scoring engine

New: `src/lib/backtest/score.ts` (pure, deterministic, integer-fils — no AI, no floats). Given a priced quote (from `runPipeline`, §6.2) and the case's `golden_lines`.

### 6.1 Deterministic alignment (two-pass)

Inputs: priced line `{ position, itemCode?, descriptionOriginal, unitCanonical, rateFils, flags }`; golden line = its columns. `runPipeline`'s `PricedRow` (`src/lib/export/priced-boq.ts`) exposes no explicit index, so `score.ts` derives `position` = the 0-based index into the returned `rows[]`; `flags` = `PricedRow.flags` (the `string[]` of codes), and the §6.3 "aligned AND priced" filter treats a line as unpriced iff its `flags` contain `NO_MATCH` or `NEEDS_MANUAL`. All normalization lives in `score.ts` (not ingest):

- `normDesc` = trim → collapse whitespace → strip Arabic diacritics/tatweel → digit-fold Arabic-Indic → lowercase Latin → drop punctuation.
- `normCode` = uppercase, strip non-alphanumerics.

**Pass 1 — exact key:** match iff `normCode` is non-empty on **both** and equal. A blank code is **never** an exact match. Do **not** use `sort_order`/`position` as an exact key (multi-source Omar Matar cases share no line origin). Tie-break: smallest `|position − sort_order|`, then lowest `sort_order`.

**Pass 2 — fallback (over lines unmatched by pass 1):** `similarity` = **token-set Jaccard** over `normDesc` tokens, compared as an integer ratio (no floats: `|intersection|·100 ≥ 60·|union|`). Candidate iff `≥ 0.60`. Greedy descending; ties broken by equal `unitCanonical`, then `|position − sort_order|`, then lowest `sort_order`, then lowest `position`. **One-to-one.**

Lines unmatched **both ways** → **coverage only**, never rate accuracy.

### 6.2 What runs (and the runPipeline extension the gate needs)

`npm run backtest` **re-runs the full pipeline per case** — it does *not* score a persisted prior quote (frozen rates can't A/B-test a new parameter). It constructs `claudeCliAdapter()` and calls `runPipeline({ file: case.input_path, profileSlug, adapter, asOf, overrides, skillVersions })`, then feeds the priced rows into `score.ts`.

`runPipeline` gains two optional inputs (defaults preserve today's behaviour):
- `overrides?: ProjectOverrides` — threaded through `assembleAndPrice` (add `overrides?` at `assemble.ts:60`, forward at `:65`) into `priceQuote`'s **already-existing** `overrides` param (`price-quote.ts:42-81`).
- `skillVersions?: Record<tradeSlug, versionId>` + `profileVersionId?` — new `getSkillVersionById`/`getProfileVersionById` helpers in `db/skills.ts`; fall back to `getActiveSkill`/`getActiveProfile` for unpinned trades.

A run is **config-pinned reproducible** (the `{skillVersions, profileVersionId, overrides, asOf}` snapshot is exactly what persists into `backtest_runs.config`) but **not bit-deterministic** — tagging/matching are AI and may vary run to run; only `score.ts` is deterministic given a fixed priced quote.

### 6.3 Metrics — signed integer basis points

All error/deviation metrics are **signed integer basis points** (1% = 100 bps), never fils or floats. Add a signed `roundHalfAwayFromZero(n, d)` (the existing `roundDivHalfUp` only handles `n ≥ 0`).

- **Per-line** `e_bps = roundHalfAwayFromZero((estRateFils − truthRateFils) × 10000, truthRateFils)`. `truthRate = 0` excluded (coverage only). Only lines that aligned **and** were priced (not `NO_MATCH`/`NEEDS_MANUAL`) count.
- **Within ±X%** iff `|e_bps| ≤ X·100` (inclusive boundary). Report ±5 / ±10 / ±20.
- **Mean signed error** = `roundHalfAwayFromZero(Σ e_bps, count)` (bias direction).
- **Median absolute error**: sort `|e_bps|`; odd → middle; even → `roundHalfAwayFromZero(lo + hi, 2)`; empty → `null`/"n/a", **never 0**.
- **Grand-total deviation** = `roundHalfAwayFromZero((Σ estAmount − Σ truthAmount) × 10000, Σ truthAmount)` bps; guard `Σ truthAmount = 0` → report N/A, not divide.
- **Per-trade** breakdown by `golden_lines.trade`; **per-project-type** aggregate across cases of the same `project_type`.

Historical acceptance-test numbers (within ±10% / ±25% / median) remain expressible in these units.

## 7. CLI & run architecture

```
npm run golden:build -- --case <slug>     # parse priced_path → golden_lines (one-time)
npm run backtest                          # score every SCORED case (truth_source != 'none')
npm run backtest -- --case alsafi-civil   # one case
npm run backtest -- --label with-burden   # tag the run for A/B comparison
npm run backtest -- --compare baseline with-burden   # diff two labelled runs
```

- Both scripts are `tsx` entrypoints (`scripts/golden-build.ts`, `scripts/backtest.ts`) and **must `import './_env'` as their first line** before any Supabase client — same pattern as `scripts/pipeline.ts` (or they won't load `.env.local`). They run against the shared cloud DB via `serviceClient()` (CLI node), never the browser. Add the two `package.json` scripts.
- The default sweep selects **only `truth_source != 'none'`**; candidate cases are skipped and reported "skipped: no truth". `--case <slug>` on a `none` case errors "case has no ground truth".
- Because each case re-runs the AI pipeline (~30–40 s/CLI call; JAH ≈ minutes), run in the background.
- `--compare` prints the delta per metric, per trade, per project-type, with a verdict **improved / regressed / neutral** per segment. This is the A/B gate.

## 8. The regression / A-B gate

The deliverable that makes the program disciplined:

- **Baseline run** is stored once (current estimator, no new parameters).
- Each new parameter (or skill-version activation) is scored as a labelled run and **compared to baseline**.
- **Gate rule:** a parameter becomes a default only if `--compare` shows it does **not regress** grand-total deviation or median error on any project-type segment, and improves at least one. Parameters that only help one project type ship as *type-scoped defaults*, not global.
- This wires into the existing "skill activation" step (Phase-1 design already separates create-version from activate-version precisely to allow backtest gating). Activation can be blocked if the new version scores worse than its predecessor.

## 9. Non-goals for Phase A

- No new estimator parameters (that's B/C/D). Phase A only *measures*.
- No stochastic/Monte-Carlo scoring (`score.ts` is deterministic given a fixed priced quote; ranges come in Phase D).
- No UI — CLI + persisted `backtest_runs` is enough; a dashboard can come later.
- **Storage refs out of scope:** `input_path`/`priced_path` are **filesystem paths relative to the repo root**, resolved as `path.resolve(REPO_ROOT, p)`. No Supabase Storage resolver (none exists in the codebase). The register-cases step `fs.existsSync`-checks every path and **fails loudly** on a miss — note the byte-exact filenames including the **double space** in `Package 9A Architectural  Works priced.pdf` and the `&` in the Omar Matar names.

## 10. Testing

- **`score.ts` metrics** against hand-built fixtures (2–3 lines, known truth) → exact **bps integers**. Deterministic, no AI. Assert `roundHalfAwayFromZero` handles negative numerators; within-±X boundary is inclusive; empty-set median is `null` not `0`.
- **Alignment** unit tests: pass-1 exact code match; blank-code never exact; pass-2 Jaccard ≥0.60 fallback; one-to-one enforcement; unmatched-both-ways → coverage only.
- **Priced reader** (§5.1) 5-row fixture: integer/decimal/float-artifact rate, blank-amount row, header-row skip.
- **AlSafi reproduction** — do **not** hardcode "66% / median 0%". Those came from a hand-curated flat one-rate-per-trade set over the ~44 matched-line subset, **not** the file's 87 column-E lines (which have per-trade price variance and lump-sum contaminants like 2500/22000). Instead: (1) define AlSafi golden truth = per-line column E as read by the priced reader; (2) denominator = lines with numeric column-E truth **and** pipeline matched-and-priced (contaminants excluded via the `NEEDS_MANUAL`/unit gate); (3) config = the `alsafi-civil` profile snapshot in `backtest_runs.config`; (4) run `golden:build` + `backtest` once, **commit the resulting summary as a golden snapshot fixture**, and the test asserts EQUALS it (bps-exact). Optional soft sanity (`median < 500 bps`, `≥60% within ±10%`) labelled "consistent with the acceptance-test headline".
- Fils/bps-exact assertions throughout; no float tolerance.

## 11. Golden-case registry & deliverables

**Registry** (`scripts/register-golden.ts`, committed — not ad-hoc). Insert one `golden_cases` row per scored case with exact values:

| slug | project_type | input_path | priced_path | profile_slug | truth_source |
|---|---|---|---|---|---|
| `omar-matar-9b-civil` | civil | `reference-docs/Omar Matar Street without price.pdf` | `reference-docs/Package 8 & 9 B Omar Matar Street with price.pdf` | *(civil profile)* | priced-tender |
| `omar-matar-9a-structural-mep` | mep | `reference-docs/Omar Matar Street without price.pdf` | `reference-docs/Package 9 A Structural & MEP Works priced.pdf` | *(mep profile)* | priced-tender |
| `omar-matar-9a-architectural` | architectural | `reference-docs/Omar Matar Street without price.pdf` | `reference-docs/Package 9A Architectural  Works priced.pdf` | *(arch profile)* | priced-tender |
| `alsafi-civil` | civil | `reference-docs/test-boqs/AlSafi_Civil.unpriced.xlsx` | `reference-docs/test-boqs/AlSafi_Civil.xlsx` | *(civil profile)* | priced-tender |

Candidate rows (`labs-fitout`, `jah-amman`, `fountain-square`) insert with `priced_path` NULL, `truth_source='none'`.

**Deliverables:**

- [ ] Migration: `golden_cases` (+ enum/priced_path CHECKs), `golden_lines`, `backtest_runs`, with §7.3 service-role grants.
- [ ] `AlSafi_Civil.unpriced.xlsx` — committed copy of `AlSafi_Civil.xlsx` with cols E+F dropped.
- [ ] Priced-column reader: `opts.readPrices` on `ingestExcel` + `ingestPdf`; `RATE_HEADER`/`AMOUNT_HEADER` split; `parseJDNumberToFils` + `parsePriceToFils`; `EXTRACT_SYSTEM_PRICED` prompt; `PricedRawLine`/`PricedExtractionResult`; build-time flag-column/NULL guard.
- [ ] **Seed + activate the project-type profiles** the cases price against (`createProfile` + `createProfileVersion({trades:[…]})` + `activateProfileVersion`) as a committed seed script — else `runPipeline` throws «غير مفعّل». Enumerate the trade-skill slugs each profile's `trades[]` needs.
- [ ] `runPipeline` extension: optional `overrides` + `skillVersions`/`profileVersionId` (defaults preserve current behaviour); `getSkillVersionById`/`getProfileVersionById` in `db/skills.ts`.
- [ ] `scripts/golden-build.ts` (`import './_env'` first; reads `priced_path`; resolves `trade` via §5.2).
- [ ] `src/lib/backtest/score.ts` — two-pass alignment + bps metrics + per-trade + per-type; `roundHalfAwayFromZero`.
- [ ] `scripts/backtest.ts` (`import './_env'`) + `package.json` scripts; `--case`/`--label`/`--compare`; skip `truth_source='none'`.
- [ ] `scripts/register-golden.ts` (with `fs.existsSync` path guard).
- [ ] Store the baseline run; commit the AlSafi golden-snapshot fixture.
- [ ] Wire the gate into skill activation.
- [ ] Tests (score metrics, alignment, priced-reader fixture, AlSafi snapshot-equality integration).
