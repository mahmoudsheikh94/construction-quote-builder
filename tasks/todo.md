# Construction Quote Builder — Master TODO

> Spec: `docs/superpowers/specs/2026-07-03-construction-quote-builder-design.md`
> Roadmap: `docs/superpowers/plans/2026-07-03-master-roadmap.md`

## Phase 1 — Domain Core ✅ COMPLETE (detailed plan: `docs/superpowers/plans/2026-07-03-phase-1-domain-core.md`)

All 10 tasks implemented, per-task reviewed, and whole-branch reviewed (Opus). 47/47 tests green (8 domain/smoke + 3 DB integration). No Critical/Important findings survived. Ledger: `.superpowers/sdd/progress.md`.

- [x] Task 1: Project scaffold (Next.js 16 RTL shell, Vitest, local Supabase, reference-docs move)
- [x] Task 2: Money module (fils arithmetic, half-up rounding, decimal micro-units)
- [x] Task 3: Normalization module (Arabic-Indic digits, canonical units)
- [x] Task 4: Core schema + quotes repository (projects/quotes/line_items)
- [x] Task 5: Price book (dated entries, as-of snapshots)
- [x] Task 6: Trade skills + profiles (immutable versioning, explicit activation)
- [x] Task 7: Cost engine (material+labor+equipment+waste+markup, deterministic)
- [x] Task 8: Project overrides (price book, markup precedence, labor premium)
- [x] Task 9: Rollup engine (section/grand totals, carried-forward reconciliation)
- [x] Task 10: Validation flags + priceQuote orchestrator

## Phase 2 — AI Adapter + Ingestion + Matching ✅ COMPLETE (detailed plan: `docs/superpowers/plans/2026-07-03-phase-2-ingestion-pipeline.md`)

All 12 tasks + a 6-finding fix wave from the whole-branch review. 88/88 tests green, tsc clean. Extraction LIVE-verified against the real 103-page Karak factory BOQ (17 items, clean checksums). Ledger: `.superpowers/sdd/progress.md`.

- [x] AIAdapter interface + claude -p implementation (zod-validated, retry, typed errors)
- [x] Arabic number-words parser (dual-notation checksum)
- [x] Excel ingestion
- [x] PDF vision ingestion (page-range chunking + maxChunks cost bound)
- [x] Item-type gate
- [x] Tagger + corpus persistence (order-independent signatures, hit-count fast path)
- [x] Deterministic matcher + semantic fallback matcher
- [x] **Price-book unit ↔ cost-model unit cross-check → `PRICE_UNIT_MISMATCH`** (Phase 1 carry-forward I-1, done in P2-9)
- [x] Headless pipeline CLI, E2E against a seeded BOQ (`npm run pipeline`)
- [x] AI-draft seeding with human-review gate (`npm run` via scripts/seed.ts)
- [x] Whole-branch fix wave: C1 duplicate-itemCode join collision, C2 per-line AI-error abort, I2 per-trade re-tagging, I3 dropped ingestion warnings, seed JSON re-validation

## Phase 3 — Web UI (Arabic RTL)

- [ ] **PRECONDITION before writing the first RLS policy:** tighten `grant all ... to anon, authenticated` on all tables (projects, quotes, line_items, price_book_entries, trade_skills, skill_versions, project_type_profiles, profile_versions) to least-privilege. Safe/inert today under zero-policy RLS, but becomes load-bearing the instant a permissive policy exists (Phase 1 whole-branch review, carried-forward finding #1).
- [ ] Auth + RTL shell + fonts
- [ ] Projects + upload + pipeline trigger
- [ ] Ingestion review screen
- [ ] Pricing workspace (flags, breakdown drawer, scope popup, corrections table)
- [ ] Skill editor (versions, diff, rollback) + price book editor
- [ ] Export: Excel (RTL) + PDF mirroring input layout

## Phase 4 — Backtest Harness + Seeding

- [ ] Golden-set builder from priced tenders
- [ ] Scoring engine + `npm run backtest`
- [ ] Regression gate on skill activation
- [ ] Seed + review all 13 trade skills
- [ ] Shadow-mode procedure

## Review

### Phase 1 — Domain Core (2026-07-03)

**Delivered:** a fully headless, tested pricing core for Jordanian BOQs. 13 commits, 47 passing tests (8 domain/smoke files + 3 real-DB integration files), executed via subagent-driven development (fresh implementer + independent reviewer per task, then a whole-branch Opus review).

**What it does:** ingests structured line items (schema + repos), holds a dated price book with as-of snapshots and versioned trade-skills/profiles (DB-trigger-immutable), and deterministically prices a quote — cost engine (material+labor+equipment+waste+markup, integer fils, BigInt half-up, exact to the fils), per-project overrides, section/grand-total rollup with reconciliation, and the `priceQuote` orchestrator emitting a 11-code flag taxonomy. The LLM does no arithmetic; all pricing is code. Arabic-first throughout (flag messages carry `messageAr`, RTL shell).

**Notable during build:**
- Local Supabase needed an explicit `grant all` per migration (local `db reset` runs as `postgres`; API roles lack default CRUD). Verified safe under zero-policy RLS. Logged as a reusable Supabase learning.
- Task 8 brief contained a deliberate throwaway function (a throwing `applyLaborPremium`) the plan says to delete — excluded correctly.
- Controller added 4 hardening tests beyond the plan (price-book effective_date ordering, rollup first-appearance ordering + grand-total mismatch, priceQuote UNIT_UNKNOWN/OUT_OF_BAND through the orchestrator) to close load-bearing but untested branches surfaced by reviewers.
- Mid-session the Supabase Postgres container went unhealthy (Docker fallout); recovered via full stop + force-rm + network rm + clean start; all DB tests green after.

**Whole-branch review (Opus): READY for Phase 2, no Critical.** Applied immediately (commit 5820761): centralized `ItemType` into `types.ts`; reserved the `PRICE_UNIT_MISMATCH` flag code. Carried forward: I-1 price-unit cross-check → Phase 2 (see Phase 2 list); grant-tightening → Phase 3 precondition (see Phase 3 list); version-number race → multi-user phase (backstopped by unique constraint today). Full detail in `.superpowers/sdd/progress.md`.

_(Filled in as phases complete, per workflow.)_

## Fix-wave: Phase 2 whole-branch review findings (2026-07-03)

Branch: main. Baseline: 81 tests passing.

### C1 — Duplicate itemCode collision (assemble.ts + priced-boq.ts)
- [x] `toMatchedItem` (src/lib/pipeline/assemble.ts:21): id = `${line.itemCode ?? "row"}-${line.sortOrder}`
- [x] `toPricedRows` (src/lib/export/priced-boq.ts:16): id = `${raw.itemCode ?? "row"}-${raw.sortOrder}` (same formula)
- [x] Keep `itemCode` as separate display field on PricedRow (already is)
- [x] New test: two raw lines, same itemCode "1/1", different sortOrder + different prices → each priced row gets its own correct rate. Confirmed fails before fix.
- [x] Update existing id-format assertions in assemble.test.ts / priced-boq.test.ts / run.test.ts. Money assertions untouched.

### C2 — One malformed AI response aborts whole pipeline (run.ts)
- [x] Wrap per-line tag+match block in try/catch in runPipeline loop
- [x] On catch: match = null, continue to next line
- [x] New test: fake adapter throws for one line's tag/match, succeeds for others → runPipeline returns, good lines priced, bad line NO_MATCH. Confirmed fails before fix.

### I1 — provisional_sum/lump_sum never carry givenAmountFils
- [x] Investigated: RawLine has no reliable JD-amount field for these types (only `quantityRaw`, shared/ambiguous with unit_rate quantities)
- [x] Decision: kept NEEDS_MANUAL as visible known-limitation (already surfaced via flags → export today). No fabrication of money from non-money fields. Documented in fix-wave-report.md.

### I2 — tagLine re-called per trade (run.ts)
- [x] Hoisted tagLine out of trade loop — call once per line (first candidate trade), loop matchLine per trade with same tags
- [x] run.test.ts fake adapter still passes; new test asserts tag-call-count == 1 across 2 trades

### I3 — extraction warnings dropped (run.ts, priced-boq.ts, scripts/pipeline.ts)
- [x] Threaded extraction.warnings through runPipeline's return value
- [x] Added `ingestionWarnings` field to toPricedJson output
- [x] Print count + first 5 in scripts/pipeline.ts CLI summary

### SEED RE-VALIDATION — scripts/seed.ts persist mode
- [x] Validate parsed draft JSON against DRAFT_SCHEMA before persisting
- [x] Throw clear Arabic error on failure
- [x] Confirmed typecheck + seed test suite still passes

### Final verification
- [x] Full `npm test` green — 88 passed (81 baseline + 7 new)
- [x] `npx tsc --noEmit` clean
- [x] Wrote report to .superpowers/sdd/fix-wave-report.md
- [x] Commits: 5f3d5bb (C1), 4affc80 (C2), 43930b2 (I2), cf65915 (I3), 347178c (seed)
