# Construction Quote Builder — Master TODO

> Spec: `docs/superpowers/specs/2026-07-03-construction-quote-builder-design.md`
> Roadmap: `docs/superpowers/plans/2026-07-03-master-roadmap.md`

## Phase 1 — Domain Core (detailed plan: `docs/superpowers/plans/2026-07-03-phase-1-domain-core.md`)

- [ ] Task 1: Project scaffold (Next.js 16 RTL shell, Vitest, local Supabase, reference-docs move)
- [ ] Task 2: Money module (fils arithmetic, half-up rounding, decimal micro-units)
- [ ] Task 3: Normalization module (Arabic-Indic digits, canonical units)
- [ ] Task 4: Core schema + quotes repository (projects/quotes/line_items)
- [ ] Task 5: Price book (dated entries, as-of snapshots)
- [ ] Task 6: Trade skills + profiles (immutable versioning, explicit activation)
- [ ] Task 7: Cost engine (material+labor+equipment+waste+markup, deterministic)
- [ ] Task 8: Project overrides (price book, markup precedence, labor premium)
- [ ] Task 9: Rollup engine (section/grand totals, carried-forward reconciliation)
- [ ] Task 10: Validation flags + priceQuote orchestrator

## Phase 2 — AI Adapter + Ingestion + Matching (detailed plan written when Phase 1 done)

- [ ] AIAdapter interface + claude -p implementation (zod-validated, retry, typed errors)
- [ ] Arabic number-words parser (dual-notation checksum)
- [ ] Excel ingestion
- [ ] PDF vision ingestion (two-pass for scanned docs)
- [ ] Item-type gate
- [ ] Tagger + corpus persistence
- [ ] Deterministic matcher + semantic fallback matcher
- [ ] Headless pipeline CLI, E2E against Karak factory BOQ

## Phase 3 — Web UI (Arabic RTL)

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

_(Filled in as phases complete, per workflow.)_
