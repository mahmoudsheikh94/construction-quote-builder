# Phase 3 — Web UI Design Spec

**Date:** 2026-07-03
**Status:** Approved design, pending implementation plan
**Builds on:** Phases 1, 2, 2.1 (domain core + pricing pipeline, all complete, 106 tests green)

## 1. Problem & Goal

The pricing engine and pipeline are validated (on real BOQs: rate-correction took AlSafi to 0% median error vs a human estimator). But it's CLI-only. Mahmoud wants to hand it to one strong engineer to (a) give UI feedback and (b) **update the trades/rates** — the estimator-judgment work that makes the tool accurate. That authoring surface (enter prices per trade) is the core new requirement.

## 2. Architecture — Two Surfaces, One Database, Deliberate Compute Split

- **Shared hosted Supabase** (one cloud project) holds all trades, rates, and quotes. Both Mahmoud's localhost and the Vercel app point at it.
- **Localhost = compute/ingestion node.** Mahmoud runs `npm run pipeline` locally (where the `claude` CLI works and is licensed for personal use). The pipeline now **persists the priced quote to the cloud DB**, not just local files.
- **Vercel = read/edit web app.** Pure Supabase client — no pipeline, no CLI (so it deploys cleanly on serverless). Three jobs: view/correct quotes, edit the rate library (price book + cost models per trade), and auth.
- **Auth:** Supabase email/password, two accounts (Mahmoud + engineer). Everyone-logged-in-can-do-everything (no roles yet). Public URL kept private to the two of them via login.
- **Stack:** existing Next.js 16 App Router + Supabase scaffold; add `@supabase/ssr` for SSR auth; server actions for DB writes; RTL Arabic UI throughout (built with the frontend-design skill).

The clean boundary: the Vercel app is a DB client via Supabase; the pipeline is the only CLI-dependent piece and stays local. No direct-API adapter needed yet.

## 3. Screens

- **`/login`** — Supabase email/password sign-in; redirects to `/`. Middleware protects every other route; unauthenticated → `/login`.
- **`/` (dashboard)** — recent quotes (project name, date, grand total, flagged count), at-a-glance stats (total quotes, total trades, total price-book entries), quick links to rate library.
- **`/quotes`** — table of priced quotes: project name, created date, grand total (JD), # flagged. Row click → detail.
- **`/quotes/[id]`** — the priced line-item table (RTL): item code, description, unit, quantity, unit rate, amount, status flag. Flagged rows (NEEDS_MANUAL / NO_MATCH / UNIT_* ) visually highlighted. Inline-edit any line's unit rate → amount + section/grand totals recompute live. On save, a popup asks: **"this quote only"** or **"update the trade's rate"**; the latter writes back (see §4). Export button → Excel (reuse `writePricedExcel`).
- **`/trades`** — list of trades (slug, name, # cost models, active version). "Add trade".
- **`/trades/[slug]`** — edit the trade's active version's cost models: for each model — labelAr, unit (canonical dropdown), keywords (chips), price-book key (select from price book), waste %, markup %, optional band. "Add cost model", "remove". **Save = create + activate a new immutable skill version** (drives existing `createSkillVersion` + `activateSkillVersion`). A read-only **version history** panel lists past versions (number, changelog, date) with one-click **"activate this version"** (rollback).
- **`/price-book`** — table of base rate entries: key, labelAr, unit, price (JD, entered/displayed as JD, stored as fils). Add/edit; each edit is a new dated `price_book_entries` row (versioned by nature via as-of snapshots).

## 4. Data Flow & Backend Additions

- **Auth wiring:** add `@supabase/ssr`. A browser client (client components) and a server client (server components/actions) that read the user session from cookies. `proxy.ts` (Next 16 middleware) refreshes the session and gates routes. UI DB access goes through the **user session** (RLS-enforced), not the service-role key. The service-role client remains for the local pipeline only.
- **RLS migration:** a new migration that (a) tightens the broad `grant all ... to anon, authenticated` on all app tables to least-privilege, and (b) adds policies: `authenticated` may `select`/`insert`/`update` the app tables; `anon` denied. (Closes the Phase 1 whole-branch carry-forward.)
- **Pipeline → DB persistence:** a `saveQuote(projectName, rows, rollup, skillVersionIds, priceSnapshotAsOf)` repo function writing the priced quote into `quotes` + `line_items`, pinning the skill versions + price-book snapshot used (provenance). `runPipeline`/`scripts/pipeline.ts` call it after pricing (in addition to the local file export). This is the bridge making local runs visible on Vercel.
- **Correction writeback:** a server action `applyCorrection(lineId, newRateFils, scope)`:
  - `scope: "quote"` → update just that `line_items` row's rate + amount.
  - `scope: "trade"` → also update the underlying price-book entry (new dated entry) OR the matched cost model (new skill version), so future quotes use it. Logs to a **new `corrections` table** (created by a migration in this phase: line id, before/after fils, scope, user id, timestamp) for the correction telemetry the original design envisioned.
- **Cloud setup:** `supabase db push` all migrations to a hosted project; set Vercel env (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) to the cloud project; the local pipeline's `.env.local` also points at the cloud project (service-role key) so its writes land in the shared DB.

## 5. Component Boundaries (for isolation)

- `lib/supabase/{browser,server}.ts` — session-aware client factories (distinct from the existing service-role `db/client.ts`).
- Server actions in `app/**/actions.ts` — one file per feature (quotes, trades, price-book), each a thin wrapper over the existing `db/` repos + the new writeback logic.
- Presentational components (tables, editors, the correction popup) take data as props, emit actions — testable in isolation.
- Reuse everything in `lib/domain/` and `lib/db/` unchanged; the UI is a new layer on top. `lib/export/priced-boq.ts` reused for the export button.

## 6. Scope

### v1 (in)
- 4 screens: login, dashboard, quotes (list+detail), rate library (trades + price book).
- Supabase email/password auth + RLS policies (authenticated read/write, anon blocked).
- Pipeline persists priced quotes to the DB.
- Trade/cost-model editing with immutable versioning + history + one-click rollback.
- Price-book editing (dated entries).
- Line-level quote correction with this-quote-vs-update-trade writeback + corrections log.
- Excel export from the quote view.
- Deploy target: Vercel + hosted Supabase.

### Deferred
- Project-type profile editing in the UI.
- Role-based permissions.
- Direct-API AI adapter (pipeline stays local/CLI — required before the app itself runs pricing or before resale).
- PDF export; drawing takeoff; execution tracking.

## 7. Testing

- Server actions + new repo functions (`saveQuote`, `applyCorrection`) unit-tested against local Supabase (as the existing db tests are).
- RLS policies tested: an `authenticated`-role query can read/write; an `anon` query cannot.
- A couple of component/integration smoke checks (correction popup writeback; trade save → new active version; rollback).
- Frontend built with the frontend-design skill for visual quality; RTL correctness verified.
- All existing 106 tests must stay green.

## 8. Risks & Mitigations

- **RLS mistake exposing data** → test anon-denied explicitly; keep service-role only in the local pipeline, never shipped to the browser.
- **Cloud/local env drift** → both point at the same cloud project; document the env setup; migrations are the single source of schema truth (`db push`).
- **Money formatting in the browser** → reuse `filsToJDString`/`parseJDToFils` (never float math in the UI); rates entered as JD, stored as fils.
- **Versioning churn from every keystroke** → a version is created only on explicit Save, not per edit.
- **Pipeline still CLI/local** → clearly a v1 constraint; the engineer views/edits, Mahmoud runs pricing. Documented.
