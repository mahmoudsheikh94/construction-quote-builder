# Construction Quote Builder — Design Spec

**Date:** 2026-07-03
**Status:** Approved design, pending implementation plan
**Market:** Jordan (Arabic-first)

## 1. Problem & Goal

Jordanian contractors receive tender packages: an unpriced Bill of Quantities (BOQ), a general project description, and drawings (DWG/PDF). An engineer studies the package and prices every line item using experience-based judgment (market rates, crew productivity like "a tiler lays ~15 m²/day", material costs, markup).

The quote builder automates ~90% of this pricing work. The engineer supplies the last ~10%: reviewing flagged items, correcting assumptions, and applying project-specific judgment. The long-term roadmap pushes toward 100% (including quantity takeoff from drawings), but v1 trusts the BOQ's quantities as given.

**v1 purpose: internal validation.** Built for the founder/small team to price real tenders. Once validated, it becomes a product sold to Jordanian contractors (that transition requires the AI-adapter swap described in §3).

## 2. Source Document Reality (from analyzed examples)

Findings from real tender documents in this repo:

- **Two BOQ dialects coexist:** (a) Arabic-native RTL, Ministry of Public Works spec references, م²/م³/م.ط/عدد/طن/مقطوع units, dinar/fils split columns; (b) English-native CSI MasterFormat (international consultants), combined JD column. Both must be supported.
- **Unpriced and priced BOQs are structurally identical** — same columns, rate/amount blank vs. filled. One schema covers both states.
- **Universal rollup convention:** item → page collection → section/division total → bill summary → grand summary, with explicit "carried forward" audit trails. Non-negotiable in output.
- **Quantities are dual-notated** (digits + Arabic words) as an anti-fraud convention — usable as a free ingestion checksum.
- **Item descriptions reference structured codes:** Ministry spec clauses (بند ٥/٢١٢), Jordanian Standards (م.ق.أ), international standards (ASTM, SMACNA, UL), sometimes drawing numbers.
- **Provisional sums, dayworks, and lump-sum items** are structurally distinct categories (infra tenders carry P.S. + separate 10% overhead/profit lines).
- **Some real BOQs are scanned photocopies with no text layer** — vision-based extraction is mandatory, not optional.
- **~13 trade sections** typical: excavation/paving, concrete, block masonry, plastering, tiling/flooring, joinery, metal/aluminum/PVC, painting/decor, roof insulation, external works, steel structure, electrical, mechanical.

## 3. Architecture & Stack

- **Web app, Arabic-first, full RTL UI.** Next.js App Router; RTL-aware component setup; Arabic typography. English is a future i18n layer — not built in v1.
- **Postgres** for all structured data (entities in §4).
- **AI execution adapter — the single most important boundary in the codebase.** One internal interface: *given skill context + data, return a structured, schema-validated result.* v1 implementation shells out to Claude Code CLI (acceptable for personal/internal use on the founder's own subscription). Before any resale, this swaps to a direct LLM API implementation (Anthropic first, provider-swappable). Nothing outside the adapter may know which implementation is active.
- **Single-tenant** in v1. Multi-tenancy is a deliberate later migration.
- **Auth:** simple email/password or magic-link login. No roles in v1.

## 4. Data Model (core entities)

- **Project** — metadata, project type, general description, uploaded source documents.
- **Project-Type Profile** — JSON defining which trade skills activate for a type (residential, steel hangar, infrastructure, …). Drives the UI project-type dropdown dynamically. Editable in-app; new types addable via the feedback loop.
- **Trade Skill** (~13 seeded at launch) — the versioned knowledge unit per trade. Contains:
  - **Cost models:** parametric formulas per work pattern — material quantities/costs + labor (productivity norm × wage) + equipment + waste factor + markup — referencing the Price Book, never hardcoding commodity prices.
  - **Rate-matching corpus:** accumulated records of (raw BOQ text → structured tags → resolved rate + components). Grows with every processed BOQ; the deterministic fast path.
  - **Plausibility bands:** min/max sane rate per entry (validation input).
  - **Version history:** every accepted change creates a new immutable version — diffable, rollback-able, git-like.
- **Price Book** — shared, dated table of base commodity/labor prices (cement bag, rebar/ton, mason day-rate, tiler day-rate, …). Skill formulas reference entries by key; updating the book ripples through all dependent skills. Dated versions retained.
- **Quote** — a priced instance of a project's BOQ. Stores extracted line items, tags, matches, computed prices, flags, engineer edits, and **pinned versions** of every skill + price book used (reopening an old quote never silently reprices).
- **Line Item** — code, description (original language preserved), unit, quantity, item type (unit-rate | provisional sum | dayworks | lump sum | %-line), tags, matched rate + components, confidence, flag status, provenance (corpus entry, skill version, price book version, overrides applied).
- **Correction Log** — every engineer edit: what changed, scope chosen (project-only vs. skill update), before/after, timestamp. Feeds telemetry (§7) and skill versioning.
- **Per-project Overrides** — any cost component overridable at project level (remote-site labor premium, client-specific markup, material spike) without touching shared skills.

## 5. Core Pipeline (per BOQ)

1. **Ingest** — AI vision extraction of PDF (digital or scanned) / Excel into structured line items (code, description, unit, quantity). Handles both dialects (§2). Dual-notation quantity checksum applied here; mismatches flagged.
2. **Classify** — engineer selects or confirms AI-suggested project type → activates trade skills per the profile.
3. **Type-gate** — each item classified by structural type first (unit-rate vs. provisional sum vs. dayworks vs. lump sum vs. %-line). Only unit-rate items proceed to rate matching; others get their own handling.
4. **Tag** — LLM extracts structured attributes per item (material, dimensions/thickness, grade, category, referenced standard). Every result saved to the trade's corpus.
5. **Match & Price** — deterministic corpus lookup first; LLM semantic matching against cost models as fallback for novel items. Price computed **in code only**: components from the cost model + Price Book, with per-project overrides applied. The LLM never performs arithmetic.
6. **Validate & Flag** — flag when: semantic fallback used, no/weak historical match, rate outside plausibility band, unit mismatch (hard stop), or checksum failure. Everything else auto-priced but fully visible and editable.
7. **Review** — engineer works flagged items (optionally all), can add/edit any line, sees the full component breakdown (material/labor/equipment/waste/markup) per rate. Every correction triggers the scope popup: **"this project only"** or **"update the skill"** (→ new skill version).
8. **Roll up** — page → section → bill → grand totals, carried-forward audit trail, reconciliation verified in code to the fils. Project-level ratio sanity checks (trade % of total, JD/m² benchmarks) run here.
9. **Export** — priced BOQ mirroring the input document's structure and layout (RTL where applicable), Excel + PDF; optional cost-breakdown backup document per item.

## 6. Skill Feedback & Versioning Loop

- Corrections marked "update the skill" produce a **new skill version** (never in-place mutation), with the correction log as its changelog.
- Project-type profiles are editable the same way — e.g., adding a new project type appears in the dropdown immediately after the profile skill is updated.
- In-app skill editor: browse/edit rate entries, cost formulas, productivity norms, plausibility bands, profiles — with validation; no raw file editing required.
- **Gate on regressions:** a new skill version must not score worse than its predecessor on the backtest harness (§7) before becoming the active version.

## 7. Pricing Correctness (verification strategy)

1. **Backtest harness (golden set).** Strip prices from the priced example BOQs (Package 9A, Omar Matar Street); run the pipeline blind; score vs. actual contractor prices (% of items within ±5/±10/±20%, grand-total deviation, per-trade accuracy). Runs on every skill version change. Validates methodology; the Price Book keeps absolute values current (golden prices are 2018).
2. **Deterministic math.** All arithmetic in code (§5.5).
3. **Domain checksums.** Dual-notation quantity cross-check at ingestion; rollup-chain reconciliation at output.
4. **Unit-mismatch hard stops.** Item unit ≠ rate unit → never auto-priced.
5. **Plausibility bands + ratio checks.** Item-level bands and project-level engineer ratios (§5.8).
6. **Item-type gating.** P.S./dayworks/lump-sum never fuzzy-matched to unit rates (§5.3).
7. **Provenance.** Every price fully explainable and reproducible; versions pinned per quote.
8. **Shadow mode.** First 2–3 real tenders priced manually in parallel; line-by-line comparison before trusting flag-only review.
9. **Correction telemetry.** Correction rate on *unflagged* items is the north-star quality metric — must trend to zero; flagging thresholds tightened from this data.
10. **Two-pass extraction for scanned docs.** Run vision extraction twice and diff; disagreements flagged (scanned photocopies are where OCR errors concentrate).

## 8. Skill Bootstrapping

All ~13 trade skills seeded before first use:

1. AI pass over the priced example BOQs extracts real (2018) rates per trade.
2. AI drafts cost-model decompositions (material/labor/equipment/markup splits + productivity norms). **These decompositions are informed estimates** — the source docs show only blended rates.
3. Engineer reviews/corrects every draft in the skill editor before the skill goes live; corrects 2018 → current values using the Price Book.
4. Backtest harness validates the seeded set end-to-end before first real use.

## 9. Scope

### v1 (in)
- Arabic-first RTL web app, single-tenant, simple auth
- Unpriced BOQ ingestion (digital PDF, scanned PDF, Excel), both dialects
- All 13 trade skills seeded and reviewed; price book; project-type profiles
- Full pipeline (§5) incl. flags, review flow, scope popup, versioning
- Backtest harness + validation mechanisms (§7)
- Export: priced BOQ (Excel/PDF) matching input layout + breakdown backup
- CLI-based AI adapter behind the swappable boundary

### Deferred (explicitly not v1)
- Multi-tenancy / resale; direct-API AI adapter (required before resale)
- Drawing/DWG quantity takeoff (the path to "100%")
- English UI / i18n; role-based access control
- Execution tracking: progress billing / IPCs, variation orders, % complete (the Husseini Mosque .xlsm mode)
- Live market price feeds

### Roadmap sketch (post-v1)
1. API adapter swap + multi-tenancy → sellable SaaS
2. Drawing takeoff (quantities from plans) → closes the biggest remaining human input
3. Execution tracking (IPC/VO) → expands from quoting into project lifecycle
4. Regional expansion beyond Jordan (new price books + spec-reference mappings)

## 10. Risks & Mitigations

- **Cost-split decompositions are guesses initially** → engineer review gate (§8), corrections sharpen them per project.
- **CLI adapter fragility (output drift, auth, rate limits)** → strict adapter boundary + schema validation on every response; failures degrade to "item flagged for manual pricing," never silent errors.
- **OCR misreads on scanned BOQs** → dual-notation checksum, two-pass extraction, ingestion review screen before pricing starts.
- **Rate-table pollution from one-off corrections** → scope popup + versioning + backtest gate.
- **2018 golden prices vs. current market** → harness measures relative/methodological accuracy; Price Book owns current absolute values.
