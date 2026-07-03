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

## Phase 2 — AI Adapter + Ingestion + Matching (detailed plan written when Phase 2 starts)

- [ ] AIAdapter interface + claude -p implementation (zod-validated, retry, typed errors)
- [ ] Arabic number-words parser (dual-notation checksum)
- [ ] Excel ingestion
- [ ] PDF vision ingestion (two-pass for scanned docs)
- [ ] Item-type gate
- [ ] Tagger + corpus persistence
- [ ] Deterministic matcher + semantic fallback matcher
- [ ] **Price-book unit ↔ cost-model unit cross-check → emit `PRICE_UNIT_MISMATCH`** (flag code already reserved in types.ts; from Phase 1 whole-branch review I-1 — prevents silent mis-pricing when a price-book entry's unit disagrees with a cost-model component's assumption)
- [ ] Headless pipeline CLI, E2E against Karak factory BOQ

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
