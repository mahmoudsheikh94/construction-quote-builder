# Construction Quote Builder — Master Implementation Roadmap

> Spec: `docs/superpowers/specs/2026-07-03-construction-quote-builder-design.md`
> Each phase below gets its own detailed, bite-sized plan written just-in-time when the
> previous phase completes. Phase 1's detailed plan: `2026-07-03-phase-1-domain-core.md`.

**Goal:** Arabic-first web app that prices Jordanian construction BOQs ~90% automatically via versioned trade skills, with the engineer reviewing flagged items.

## Tech Stack (locked for v1)

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript strict | Manual scaffold (repo already has files) |
| DB / Auth / Storage | Supabase (local via CLI for dev) | Mahmoud's established stack; service-role client for server-side writes |
| Validation | Zod 4 | Every AI-adapter response and every JSONB read/write is schema-validated |
| Tests | Vitest | Pure-function unit tests + integration tests against local Supabase |
| Styling | Tailwind CSS 4, `dir="rtl"`, IBM Plex Sans Arabic | Arabic-first from the first commit |
| Excel export | exceljs (`views: [{ rightToLeft: true }]`) | Phase 3 |
| PDF export | Print-optimized HTML → headless Chromium | Browser does Arabic shaping correctly; pdf libs don't | 
| Excel ingest | xlsx (SheetJS) | Phase 2 |
| AI execution | `AIAdapter` interface; v1 impl shells `claude -p` headless with JSON output | The ONLY module allowed to know which AI backend runs |

## Global Constraints (apply to every phase)

- **Money is integer fils.** 1 JD = 1000 fils. No floats anywhere in money paths. Rounding: half-up at the fils, applied per component, documented in `money.ts`.
- **Quantities are integer thousandths** (numeric(_,3) equivalent). Component quantities/percentages are decimal strings evaluated as scaled BigInt micro-units (×1e6).
- **The LLM never does arithmetic.** It extracts, tags, classifies, and matches. All prices are computed in code from cost models + price book.
- **Arabic-first:** every user-facing string is Arabic; `<html lang="ar" dir="rtl">`; flags carry `messageAr`.
- **Every AI response is Zod-validated** with one retry on schema failure; failures degrade to a flagged item, never a silent error.
- **Skill/profile versions are immutable** (DB trigger enforced). Activation is a separate step from creation (Phase 4 hooks the backtest gate there).
- **Every quote pins** its price-book snapshot and skill version ids (reopening never silently reprices).
- TDD per task; commit after every task.

## Phase Dependency Graph

```
Phase 1: Domain core (headless)          ← everything depends on this
   └→ Phase 2: AI adapter + ingestion + tagging/matching pipeline (headless E2E CLI)
        ├→ Phase 3: Web UI (Arabic RTL) 
        └→ Phase 4: Backtest harness + skill seeding (needs 2's ingestion; review UI from 3)
```

Build order: 1 → 2 → 3 → 4. (4's golden-set ingestion can start as soon as 2 lands.)

## Repository File Map (target state)

```
src/
  app/                       # Next.js App Router (Phase 3 fills this)
  lib/
    domain/                  # PURE logic — no I/O, fully unit-tested (Phase 1)
      types.ts               # Shared domain types (grown task-by-task)
      money.ts               # Fils arithmetic, rounding, decimal-string parsing
      normalize.ts           # Arabic-Indic digits, unit canonicalization
      cost-engine.ts         # CostModel × PriceSnapshot → RateBreakdown
      overrides.ts           # Project overrides → effective model/snapshot
      rollup.ts              # Line amounts, section/grand totals, reconciliation
      validation.ts          # Flags: units, bands, ratios
      price-quote.ts         # Orchestrator: matched items → priced lines + flags
    db/                      # Supabase repositories (Phase 1)
      client.ts              # service-role client factory
      quotes.ts              # projects/quotes/line_items repo
      price-book.ts          # dated price entries, snapshot builder
      skills.ts              # trade skills + immutable versions + profiles
    ai/                      # Phase 2
      adapter.ts             # AIAdapter interface + zod-validate + retry
      claude-cli.ts          # v1 impl: shells `claude -p`
    ingest/                  # Phase 2: pdf-vision.ts, excel.ts, arabic-words.ts, item-type-gate.ts
    pipeline/                # Phase 2: tag.ts, match.ts, run.ts (headless CLI)
    backtest/                # Phase 4: golden-set.ts, score.ts, gate.ts
supabase/migrations/         # SQL migrations, one per task that needs schema
tests/                       # mirrors src/ (unit + integration)
reference-docs/              # the example tender PDFs/xlsm (moved out of repo root)
```

## Phase 1 — Domain Core (detailed plan exists)

**Deliverable:** a tested library + schema that can represent projects/quotes/BOQ lines, dated price books, versioned trade skills & profiles, and deterministically price matched items with validation flags — provable entirely from `npm test`, no UI, no AI.

Tasks (detail in phase plan): scaffold; money module; normalization module; core schema + quotes repo; price book; skills & profiles with immutable versioning; cost engine; overrides; rollup engine; validation + `priceQuote` orchestrator.

## Phase 2 — AI Adapter + Ingestion + Matching Pipeline (outline; detail when Phase 1 done)

**Deliverable:** `npm run pipeline -- --file <boq.pdf|xlsx> --type <profile>` produces priced line items + flags JSON for a real example BOQ, end-to-end headless.

1. **AIAdapter core** — `runAI({ system, prompt, files?, schema }): Promise<T>`; `claude -p --output-format json` impl; Zod parse + one retry; typed error taxonomy (`AIUnavailable`, `SchemaMismatch`).
2. **Arabic number-words parser** — deterministic `arabicCardinalToInt('ثمانية عشر ألف') === 18000` for the dual-notation checksum (finite vocabulary; no LLM).
3. **Excel ingestion** — SheetJS → `RawLine[] { itemCode, description, unitRaw, qtyRaw, sectionRef, sortOrder }`.
4. **PDF vision ingestion** — page-chunked extraction through AIAdapter into `RawLine[]`; two-pass extraction + diff for scanned docs; dual-notation checksum → `QTY_CHECKSUM_FAIL` flags.
5. **Item-type gate** — rules-first (keyword/structure), LLM-assist fallback → `item_type` per line; P.S./dayworks/%-lines never reach rate matching.
6. **Tagger** — per-line structured attributes `{ material, dims, grade, category, standardRefs[] }` via AIAdapter; every result appended to that trade's corpus table.
7. **Deterministic matcher** — tag-signature lookup against corpus → `{ costModelId, method:'deterministic', confidence }`.
8. **Semantic fallback matcher** — LLM picks nearest cost model + returns *structured adjustment parameters only* (never a rate) → `method:'semantic'` (always flagged).
9. **Headless pipeline CLI** — wires 3–8 into Phase 1's `priceQuote`; E2E run against `جدول الكميات بدون اسعار.pdf`.

## Phase 3 — Web UI, Arabic RTL (outline)

**Deliverable:** engineer completes the full workflow in the browser: upload → review ingestion → review flags/prices → correct (scope popup) → export.

1. Auth (Supabase email/password) + RTL app shell + IBM Plex Sans Arabic.
2. Projects list/create; document upload to Supabase Storage; pipeline trigger + progress.
3. Ingestion review screen (extracted lines vs. source page images; fix before pricing).
4. Pricing workspace: items table (flag filters), component-breakdown drawer, edit any line, add items, **scope popup** ("هذا المشروع فقط" / "تحديث المهارة") writing to `corrections` table + skill versioning.
5. Skill editor: cost models, bands, productivity norms, profiles; version history, diff, rollback.
6. Price book editor (dated entries, history chart).
7. Export: priced BOQ Excel (exceljs, RTL) + PDF (print HTML → headless Chromium), mirroring input layout; cost-breakdown backup doc.
8. `corrections` table + telemetry queries (correction rate on unflagged items).

## Phase 4 — Backtest Harness + Seeding (outline)

**Deliverable:** scored accuracy report against the priced 2018 tenders; all 13 trade skills seeded, reviewed, and gated.

1. Golden-set builder: ingest priced PDFs (Package 9A, Omar Matar) via Phase 2 pipeline; store expected rates/amounts.
2. Scoring engine: % of items within ±5/±10/±20%, per-trade accuracy, grand-total deviation; `npm run backtest`.
3. Regression gate: skill-version activation requires backtest ≥ predecessor.
4. Seeding workflow: AI drafts `SkillContent` per trade from golden data → `draft` status → engineer review in skill editor (Phase 3) → activate.
5. Shadow-mode procedure doc for the first 2–3 live tenders.

## Definition of Done per Phase

- **P1:** `npm test` green incl. integration tests; realistic tiling cost-model test prices correctly to the fils.
- **P2:** pipeline CLI prices the Karak factory BOQ end-to-end; every unit-rate line has a match-or-flag; zero unvalidated AI responses.
- **P3:** full workflow in browser in Arabic; export reproduces input BOQ structure with reconciling totals.
- **P4:** backtest report exists; 13 skills active with engineer-reviewed content; gate enforced on activation.
