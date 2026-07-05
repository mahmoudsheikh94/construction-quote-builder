# Phase A: Backtest Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A CLI harness that re-prices real unpriced BOQs through the existing pipeline and scores the result against human-priced ground truth, reporting error as signed basis points per line / per trade / per project-type — so every parameter added in Phases B/C/D can be proven to narrow the error distribution before it ships.

**Architecture:** Three service-role tables (`golden_cases`, `golden_lines`, `backtest_runs`). A priced-column reader (a `readPrices` flag on the existing `ingestExcel`/`ingestPdf`) parses human truth prices into `golden_lines` at build time. A pure, float-free `score.ts` aligns a freshly-priced quote to the golden lines (two-pass: exact item-code, then token-set Jaccard) and computes basis-point metrics. `runPipeline` gains optional `overrides`/`skillVersions` so a run is config-pinned. Everything runs CLI-side via `serviceClient()`.

**Tech Stack:** TypeScript strict, Next.js 16 project (CLI via `tsx`), Supabase (hosted cloud), Zod 4, Vitest, `xlsx` (SheetJS), `claude` CLI adapter.

## Global Constraints

(Inherited from the roadmap `2026-07-04-accuracy-program-roadmap.md`. Every task obeys these.)

- **Money = integer fils; metrics = signed integer basis points (1% = 100 bps).** No floats in the money or metric path. `money.ts` helpers are the only sanctioned arithmetic; this phase adds one signed helper `roundHalfAwayFromZero`.
- **`score.ts` is pure and deterministic** given a fixed priced quote — no AI, no DB, no floats. AI enters only at *build* time (trade resolution) and *pricing* time (the pipeline), never in scoring.
- **New service-role tables follow the roadmap §7.3 service-role convention:** `grant all on <tables> to postgres, anon, authenticated, service_role;` then `revoke all on <tables> from anon;` — no RLS policies (written and read only by `serviceClient`).
- **Migration hygiene (roadmap §7.4):** after `supabase migration new`, run `ls supabase/migrations | tail` and rename the file if it does not sort last. One migration for this phase.
- **CLI scripts `import './_env'` as their first line** (before any Supabase client) or `.env.local` won't load — like `scripts/pipeline.ts`.
- **The repo-root `*-priced.xlsx` / `*.json` files are PIPELINE OUTPUTS, never truth.** Human truth for AlSafi is column E of `AlSafi_Civil.xlsx`. See `2026-07-04-phase-a-backtest-harness-design.md` §3 and the [[golden-set-truth-files]] memory.
- TDD per task; commit after every task.

## Existing Interfaces This Phase Consumes (verbatim, do not redefine)

```ts
// src/lib/domain/money.ts
function roundDivHalfUp(n: bigint, d: bigint): bigint;   // throws if n < 0 or d <= 0
function parseJDToFils(s: string): number;               // "9.000" -> 9000; throws on invalid (JD_RE = /^\d+(\.\d{1,3})?$/)

// src/lib/ingest/types.ts
interface RawLine { sortOrder: number; itemCode?: string; sectionRef: string; descriptionOriginal: string; unitRaw?: string; quantityRaw?: string; quantityWords?: string; }
interface ExtractionResult { lines: RawLine[]; warnings: string[]; }

// src/lib/ingest/excel.ts
function ingestExcel(path: string, opts?: { sheet?: string }): ExtractionResult;   // SYNCHRONOUS
const PRICE_HEADER = ["السعر", "المبلغ", "الاجمالي", "الإجمالي", "unit price", "total price", "total", "amount", "rate"];  // excel.ts:15

// src/lib/ingest/pdf.ts
function ingestPdf(path: string, adapter: AIAdapter, opts?: { chunkSize?: number; maxChunks?: number }): Promise<ExtractionResult>;
// EXTRACT_SYSTEM (pdf.ts:48) contains the instruction "لا تحسب أي أسعار" — the priced variant drops it.

// src/lib/pipeline/run.ts
function runPipeline(input: { file: string; profileSlug: string; adapter: AIAdapter; asOf?: string; batchSize?: number; concurrency?: number; })
  : Promise<{ json: object; rows: PricedRow[]; rollup: QuoteRollup; projectFlags: Flag[]; ingestionWarnings: string[] }>;

// src/lib/export/priced-boq.ts
interface PricedRow { itemCode?: string; sectionRef: string; description: string; unit?: string; quantity?: string; rateJD: string | null; amountJD: string | null; flags: string[]; }
// NOTE: rateJD/amountJD are JD strings (e.g. "13.388") or null — parse to fils with parseJDToFils.

// src/lib/db/skills.ts  (all take db: SupabaseClient = serviceClient())
function getActiveSkill(slug, db?): Promise<{ content: SkillContent; versionId: string; versionNumber: number } | null>;
function getActiveProfile(slug, db?): Promise<{ content: ProfileContent; versionId: string; versionNumber: number } | null>;
function createProfile(slug, nameAr, db?): Promise<...>;
function createProfileVersion(profileId, content: ProfileContent, changelog, db?): Promise<...>;
function activateProfileVersion(profileId, versionId, db?): Promise<...>;

// src/lib/pipeline/batch.ts
function batchTagLines(adapter: AIAdapter, trade: string, lines: RawLine[]): Promise<LineTags[]>;
function batchMatchLines(adapter: AIAdapter, trade: string, skill: SkillContent, items: Array<{ rawText: string; tags: LineTags }>): Promise<(MatchResult | null)[]>;

// src/lib/db/client.ts       function serviceClient(): SupabaseClient;
// src/lib/ai/claude-cli.ts   function claudeCliAdapter(opts: { timeoutMs?: number }): AIAdapter;
// scripts/_env.ts            import "./_env";  // side-effect: loads .env.local — MUST be first import
```

## Interfaces This Phase Produces (later tasks/phases rely on these — exact names/types)

```ts
// src/lib/domain/money.ts (added)
function roundHalfAwayFromZero(n: bigint, d: bigint): bigint;   // handles negative n; d != 0

// src/lib/ingest/types.ts (added)
interface PricedRawLine extends RawLine { truthRateFils?: number | null; truthAmountFils?: number | null; }
interface PricedExtractionResult { lines: PricedRawLine[]; warnings: string[]; }

// src/lib/ingest/excel.ts (extended)  ingestExcel(path, opts?: { sheet?: string; readPrices?: boolean }): ExtractionResult | PricedExtractionResult
// src/lib/ingest/pdf.ts   (extended)  ingestPdf(path, adapter, opts?: { chunkSize?; maxChunks?; readPrices?: boolean }): Promise<ExtractionResult | PricedExtractionResult>
function parseJDNumberToFils(n: number): number;      // Math.round(n * 1000)
function parsePriceToFils(raw: string): number | null;// Arabic-Indic + currency-token aware; null on unparseable

// src/lib/backtest/score.ts
interface ScoredLine { position: number; matched: boolean; priced: boolean; eBps: number | null; }
interface TradeMetrics { within5: number; within10: number; within20: number; medianAbsBps: number | null; meanSignedBps: number | null; count: number; }
interface ScoreSummary {
  within5: number; within10: number; within20: number;        // % as integer (0..100)
  medianAbsBps: number | null; meanSignedBps: number | null;
  grandTotalDevBps: number | null; coverage: number;          // % priced-and-aligned of priced lines
  byTrade: Record<string, TradeMetrics>;
  lines: ScoredLine[];
}
function scoreQuote(input: { pricedRows: PricedRow[]; goldenLines: GoldenLineRow[] }): ScoreSummary;

// src/lib/backtest/types.ts
interface GoldenLineRow { sortOrder: number; itemCode: string | null; descriptionOriginal: string; unitCanonical: string | null; truthRateFils: number | null; truthAmountFils: number | null; trade: string | null; }

// src/lib/pipeline/run.ts (extended input)
// runPipeline input gains: overrides?: ProjectOverrides; skillVersions?: Record<string, string>; profileVersionId?: string;

// src/lib/db/skills.ts (added)
function getSkillVersionById(skillId: string, versionId: string, db?): Promise<{ content: SkillContent; versionId: string } | null>;
function getProfileVersionById(profileId: string, versionId: string, db?): Promise<{ content: ProfileContent; versionId: string } | null>;
```

## File Map (target state)

```
supabase/migrations/
  <ts>_backtest_harness.sql        # golden_cases, golden_lines, backtest_runs + service-role grants
src/lib/
  ingest/
    types.ts        # + PricedRawLine, PricedExtractionResult
    price-parse.ts   # parseJDNumberToFils, parsePriceToFils (the only currency-parse path)
    excel.ts        # + readPrices; RATE_HEADER/AMOUNT_HEADER split
    pdf.ts          # + readPrices; EXTRACT_SYSTEM_PRICED
  domain/
    money.ts        # + roundHalfAwayFromZero
  backtest/
    types.ts        # GoldenLineRow, ScoreSummary, etc.
    normalize.ts    # normDesc, normCode, jaccardGe (integer)
    align.ts        # two-pass alignment
    score.ts        # scoreQuote (metrics)
  db/
    skills.ts       # + getSkillVersionById, getProfileVersionById
    golden.ts       # insertGoldenCase, insertGoldenLines, getCaseBySlug, listScoredCases, saveBacktestRun, getRunsByLabel
  pipeline/
    run.ts          # + overrides / skillVersions / profileVersionId
    assemble.ts     # + overrides pass-through
scripts/
  register-golden.ts # committed golden-case registry (fs.existsSync guard)
  seed-profiles.ts   # committed profile seed+activate for the golden cases
  golden-build.ts    # parse priced_path -> golden_lines
  backtest.ts        # re-price + score + persist; --case/--label/--compare
reference-docs/test-boqs/
  AlSafi_Civil.unpriced.xlsx   # committed: AlSafi_Civil.xlsx with cols E+F dropped
tests/backtest/
  money.test.ts, price-parse.test.ts, align.test.ts, score.test.ts, alsafi-snapshot.test.ts
tests/fixtures/
  priced-mini.xlsx             # 5-row priced fixture
  alsafi-snapshot.json         # committed golden score summary
```

---

### Task 1: Signed rounding helper `roundHalfAwayFromZero`

**Files:**
- Modify: `src/lib/domain/money.ts`
- Test: `tests/backtest/money.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `roundHalfAwayFromZero(n: bigint, d: bigint): bigint` — symmetric rounding that accepts negative `n` (the existing `roundDivHalfUp` throws on `n < 0`). Used by every bps metric.

- [ ] **Step 1: Write the failing test**

```ts
// tests/backtest/money.test.ts
import { describe, it, expect } from "vitest";
import { roundHalfAwayFromZero } from "@/lib/domain/money";

describe("roundHalfAwayFromZero", () => {
  it("rounds positive half up, away from zero", () => {
    expect(roundHalfAwayFromZero(5n, 2n)).toBe(3n);   // 2.5 -> 3
    expect(roundHalfAwayFromZero(3n, 2n)).toBe(2n);   // 1.5 -> 2
  });
  it("rounds negative half away from zero (symmetric)", () => {
    expect(roundHalfAwayFromZero(-5n, 2n)).toBe(-3n); // -2.5 -> -3
    expect(roundHalfAwayFromZero(-1n, 3n)).toBe(0n);  // -0.33 -> 0
  });
  it("is exact when divisible", () => {
    expect(roundHalfAwayFromZero(10000n, 100n)).toBe(100n);
    expect(roundHalfAwayFromZero(-9999n, 100n)).toBe(-100n); // -99.99 -> -100
  });
  it("throws on zero divisor", () => {
    expect(() => roundHalfAwayFromZero(1n, 0n)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/backtest/money.test.ts`
Expected: FAIL — `roundHalfAwayFromZero` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/domain/money.ts  (append)
export function roundHalfAwayFromZero(n: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error("roundHalfAwayFromZero: d != 0 مطلوب");
  const sign = (n < 0n) !== (d < 0n) ? -1n : 1n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = an / ad;
  const r = an % ad;
  const mag = r * 2n >= ad ? q + 1n : q;
  return sign * mag;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/backtest/money.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/money.ts tests/backtest/money.test.ts
git commit -m "feat(backtest): add roundHalfAwayFromZero for signed bps metrics"
```

---

### Task 2: Currency parsers `parseJDNumberToFils` / `parsePriceToFils`

**Files:**
- Create: `src/lib/ingest/price-parse.ts`
- Test: `tests/backtest/price-parse.test.ts`

**Interfaces:**
- Consumes: `roundDivHalfUp` (money.ts).
- Produces: `parseJDNumberToFils(n: number): number` (for Excel raw numbers) and `parsePriceToFils(raw: string): number | null` (for PDF strings — the ONLY currency-string parse path).

- [ ] **Step 1: Write the failing test**

```ts
// tests/backtest/price-parse.test.ts
import { describe, it, expect } from "vitest";
import { parseJDNumberToFils, parsePriceToFils } from "@/lib/ingest/price-parse";

describe("parseJDNumberToFils", () => {
  it("converts JS numbers to fils, absorbing IEEE artifacts", () => {
    expect(parseJDNumberToFils(9)).toBe(9000);
    expect(parseJDNumberToFils(8.5)).toBe(8500);
    expect(parseJDNumberToFils(1.1000000000000001)).toBe(1100);
    expect(parseJDNumberToFils(672.4000000000001)).toBe(672400);
  });
});

describe("parsePriceToFils", () => {
  it("parses plain Latin-digit strings", () => {
    expect(parsePriceToFils("9")).toBe(9000);
    expect(parsePriceToFils("8.5")).toBe(8500);
  });
  it("parses Arabic-Indic digits", () => {
    expect(parsePriceToFils("٨٫٥")).toBe(8500);   // ٫ decimal
    expect(parsePriceToFils("١٢٣")).toBe(123000);
  });
  it("strips currency tokens and thousands separators", () => {
    expect(parsePriceToFils("1,250 JD")).toBe(1250000);
    expect(parsePriceToFils("د.ا ٩٥")).toBe(95000);
  });
  it("returns null on unparseable input", () => {
    expect(parsePriceToFils("")).toBeNull();
    expect(parsePriceToFils("N/A")).toBeNull();
    expect(parsePriceToFils("-")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/backtest/price-parse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/ingest/price-parse.ts
import { roundDivHalfUp } from "@/lib/domain/money";

export function parseJDNumberToFils(n: number): number {
  return Math.round(n * 1000);
}

const AR_INDIC = "٠١٢٣٤٥٦٧٨٩";
function foldDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(AR_INDIC.indexOf(d)));
}

// The ONLY currency-string parse path.
export function parsePriceToFils(raw: string): number | null {
  if (raw == null) return null;
  let s = foldDigits(String(raw).trim());
  // strip currency tokens
  s = s.replace(/jd|د\.?ا|دينار|فلس/gi, "");
  // unify separators: ٬ thousands, ٫ decimal (Arabic); , thousands, . decimal (Latin)
  s = s.replace(/[٬,]/g, "").replace(/٫/g, ".");
  s = s.replace(/[^\d.]/g, "").trim();
  if (s === "" || s === ".") return null;
  const parts = s.split(".");
  if (parts.length > 2) return null;
  const whole = BigInt(parts[0] || "0");
  const frac = (parts[1] || "").slice(0, 6).padEnd(6, "0"); // micro precision, then to fils
  const micro = whole * 1_000_000n + BigInt(frac);
  return Number(roundDivHalfUp(micro, 1000n));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/backtest/price-parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/price-parse.ts tests/backtest/price-parse.test.ts
git commit -m "feat(ingest): currency parsers for the priced-column reader"
```

---

### Task 3: Priced-column reader on `ingestExcel`

**Files:**
- Modify: `src/lib/ingest/types.ts` (add `PricedRawLine`, `PricedExtractionResult`)
- Modify: `src/lib/ingest/excel.ts` (add `readPrices`, split `PRICE_HEADER`)
- Create: `tests/fixtures/priced-mini.xlsx` (built in Step 1 via a tiny script)
- Test: `tests/backtest/priced-reader.test.ts`

**Interfaces:**
- Consumes: `parseJDNumberToFils` (Task 2); existing `ingestExcel` internals.
- Produces: `ingestExcel(path, { readPrices: true })` returns `PricedExtractionResult` with `truthRateFils`/`truthAmountFils` per line; `RATE_HEADER`/`AMOUNT_HEADER` constants replace the read use of `PRICE_HEADER`.

- [ ] **Step 1: Write the failing test + build the fixture**

Create the fixture with a one-off node script (run once, commit the `.xlsx`):

```js
// scratch: build tests/fixtures/priced-mini.xlsx  (run with: node build-fixture.mjs)
import xlsx from "xlsx";
const rows = [
  ["Descriptions", "Unit", "Qty", "Unit Price", "Total price"],
  ["Section A concrete", "", "", "", ""],                 // header row: desc only -> skipped
  ["Supply C30 concrete", "m3", 10, 9, 90],               // integer rate
  ["Blockwork 200mm", "m2", 4, 8.5, 34],                  // decimal rate
  ["Plaster two coats", "m2", 4, 1.1000000000000001, ""], // float artifact, blank amount
];
const ws = xlsx.utils.aoa_to_sheet(rows);
const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
xlsx.writeFile(wb, "tests/fixtures/priced-mini.xlsx");
```

```ts
// tests/backtest/priced-reader.test.ts
import { describe, it, expect } from "vitest";
import { ingestExcel } from "@/lib/ingest/excel";
import type { PricedExtractionResult } from "@/lib/ingest/types";

describe("ingestExcel readPrices", () => {
  it("reads truth rate/amount fils and skips the section header", () => {
    const r = ingestExcel("tests/fixtures/priced-mini.xlsx", { readPrices: true }) as PricedExtractionResult;
    const lines = r.lines;
    // section-header row (desc only, no unit/qty/rate/amount) is skipped
    expect(lines.map((l) => l.descriptionOriginal)).toEqual([
      "Supply C30 concrete", "Blockwork 200mm", "Plaster two coats",
    ]);
    expect(lines[0].truthRateFils).toBe(9000);
    expect(lines[0].truthAmountFils).toBe(90000);
    expect(lines[1].truthRateFils).toBe(8500);
    expect(lines[2].truthRateFils).toBe(1100);      // float artifact absorbed
    expect(lines[2].truthAmountFils).toBeNull();    // blank amount -> null, never synthesized
  });

  it("without readPrices, behaves as before (no truth fields)", () => {
    const r = ingestExcel("tests/fixtures/priced-mini.xlsx");
    expect((r.lines[0] as { truthRateFils?: number }).truthRateFils).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/backtest/priced-reader.test.ts`
Expected: FAIL — `readPrices` not handled; truth fields undefined.

- [ ] **Step 3: Add the types**

```ts
// src/lib/ingest/types.ts  (append)
export interface PricedRawLine extends RawLine {
  truthRateFils?: number | null;
  truthAmountFils?: number | null;
}
export interface PricedExtractionResult { lines: PricedRawLine[]; warnings: string[]; }
```

- [ ] **Step 4: Split the header + read prices in `excel.ts`**

In `src/lib/ingest/excel.ts`: keep `PRICE_HEADER` for the existing exclusion behaviour, and add:

```ts
// near the header constants
const RATE_HEADER = ["سعر الوحدة", "سعر", "unit price", "unit rate", "rate"];
const AMOUNT_HEADER = ["المبلغ", "الاجمالي", "الإجمالي", "total price", "total", "amount"];
```

Change the signature and, when `opts?.readPrices`, locate the rate column (match `RATE_HEADER` first) and amount column (`AMOUNT_HEADER`), read those cells with `raw:true`, and attach `truthRateFils = cell==null ? null : parseJDNumberToFils(Number(cell))` (same for amount). Apply the section-header skip: a row with a description but **no unit AND no qty AND no rate AND no amount** is dropped. Import `parseJDNumberToFils` from `./price-parse`. Return `PricedExtractionResult` when `readPrices`, else the existing `ExtractionResult` unchanged.

```ts
export function ingestExcel(
  path: string,
  opts?: { sheet?: string; readPrices?: boolean },
): ExtractionResult | PricedExtractionResult {
  // ... existing header detection ...
  // if opts?.readPrices: resolve rateCol via RATE_HEADER, amountCol via AMOUNT_HEADER
  //   (if neither resolves, push a warning "no price column found" and leave truth fields null)
  // for each data row: compute truthRateFils / truthAmountFils via parseJDNumberToFils
  //   skip a row whose desc is present but unit,qty,rate,amount are all empty
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/backtest/priced-reader.test.ts`
Expected: PASS. Also run the existing ingest suite to confirm no regression: `npx vitest run tests/ingest` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/types.ts src/lib/ingest/excel.ts tests/backtest/priced-reader.test.ts tests/fixtures/priced-mini.xlsx
git commit -m "feat(ingest): priced-column reader on ingestExcel (readPrices)"
```

---

### Task 4: Priced-column reader on `ingestPdf` (`EXTRACT_SYSTEM_PRICED`)

**Files:**
- Modify: `src/lib/ingest/pdf.ts`
- Test: `tests/backtest/priced-pdf.test.ts` (uses a stub `AIAdapter`, no real CLI)

**Interfaces:**
- Consumes: `parsePriceToFils` (Task 2); `AIAdapter`; `PricedExtractionResult` (Task 3).
- Produces: `ingestPdf(path, adapter, { readPrices: true })` returns `PricedExtractionResult`; `EXTRACT_SYSTEM_PRICED` prompt constant; `rateRaw`/`amountRaw` optional fields on the PDF `RawLineSchema`.

- [ ] **Step 1: Write the failing test (stub adapter)**

```ts
// tests/backtest/priced-pdf.test.ts
import { describe, it, expect } from "vitest";
import { ingestPdf } from "@/lib/ingest/pdf";
import type { AIAdapter } from "@/lib/ai/adapter";

const stubAdapter: AIAdapter = {
  // returns one line with a raw price string; matches whatever schema pdf.ts requests
  run: async () => ({
    lines: [{ sectionRef: "1", descriptionOriginal: "Excavation", unitRaw: "m3", quantityRaw: "100", rateRaw: "٥٫٥", amountRaw: "550" }],
  }),
} as unknown as AIAdapter;

describe("ingestPdf readPrices", () => {
  it("parses verbatim rate/amount strings into fils", async () => {
    const r = await ingestPdf("tests/fixtures/does-not-read-file.pdf", stubAdapter, { readPrices: true, maxChunks: 1 });
    expect((r.lines[0] as { truthRateFils?: number }).truthRateFils).toBe(5500);
    expect((r.lines[0] as { truthAmountFils?: number }).truthAmountFils).toBe(550000);
  });
});
```

> Note: if `ingestPdf` reads page count from the file before calling the adapter, point the test at a tiny real committed PDF fixture instead, or guard the page-count read behind the adapter call. Keep the stub adapter — never call the real CLI in a unit test.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/backtest/priced-pdf.test.ts`
Expected: FAIL — `readPrices` unhandled; truth fields undefined.

- [ ] **Step 3: Implement**

In `src/lib/ingest/pdf.ts`:
1. Add optional `rateRaw`, `amountRaw` to `RawLineSchema` (`z.string().optional()`).
2. Define `EXTRACT_SYSTEM_PRICED` = `EXTRACT_SYSTEM` **without** the `"لا تحسب أي أسعار"` sentence, plus: `"أعد سعر الوحدة والمبلغ كما هما نصاً في الحقلين rateRaw و amountRaw دون أي حساب."`
3. Add `readPrices?: boolean` to the opts. When true, use `EXTRACT_SYSTEM_PRICED`; after extraction, set `truthRateFils = parsePriceToFils(line.rateRaw ?? "")`, `truthAmountFils = parsePriceToFils(line.amountRaw ?? "")` (import from `./price-parse`); return `PricedExtractionResult`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/backtest/priced-pdf.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/pdf.ts tests/backtest/priced-pdf.test.ts
git commit -m "feat(ingest): priced-column reader on ingestPdf (EXTRACT_SYSTEM_PRICED)"
```

---

### Task 5: Migration — `golden_cases`, `golden_lines`, `backtest_runs`

**Files:**
- Create: `supabase/migrations/<ts>_backtest_harness.sql`

**Interfaces:**
- Consumes: existing `projects` table (FK target).
- Produces: the three tables per `2026-07-04-phase-a-backtest-harness-design.md` §4, with service-role grants.

- [ ] **Step 1: Create the migration**

```bash
npx supabase migration new backtest_harness
# then: ls supabase/migrations | tail  — confirm the new file sorts LAST; if not, rename it to a later timestamp (roadmap §7.4)
```

- [ ] **Step 2: Write the SQL** (copy §4 verbatim; grants follow the service-role convention)

```sql
create table golden_cases (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_ar text not null,
  project_type text not null check (project_type in
    ('civil','mep','architectural','labs','hospital','infrastructure')),
  input_path text not null,
  priced_path text,
  profile_slug text not null,
  project_id uuid references projects(id),
  truth_source text not null check (truth_source in ('priced-tender','actual-outturn','none')),
  created_at timestamptz default now(),
  check ((truth_source = 'none') = (priced_path is null))
);

create table golden_lines (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references golden_cases(id) on delete cascade,
  sort_order integer not null,
  item_code text,
  description_original text not null,
  unit_canonical text,
  quantity_thousandths bigint,
  truth_rate_fils bigint,
  truth_amount_fils bigint,
  trade text,
  truth_source text not null default 'priced-tender',
  created_at timestamptz default now()
);

create table backtest_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references golden_cases(id) on delete cascade,
  label text,
  config jsonb not null,
  scored_at timestamptz default now(),
  summary jsonb not null
);

-- service-role table convention (roadmap §7.3)
grant all on golden_cases, golden_lines, backtest_runs to postgres, anon, authenticated, service_role;
revoke all on golden_cases, golden_lines, backtest_runs from anon;
```

- [ ] **Step 3: Push to the cloud DB**

Run: `npx supabase db push`
Expected: applies cleanly (all prior migrations already applied).

- [ ] **Step 4: Verify the tables exist**

Run: `npx supabase db push --dry-run` (should show nothing pending) — or query via a throwaway `tsx` snippet using `serviceClient()` to `select` zero rows from each table without error.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): backtest harness tables (golden_cases, golden_lines, backtest_runs)"
```

---

### Task 6: `db/golden.ts` repo

**Files:**
- Create: `src/lib/db/golden.ts`
- Create: `src/lib/backtest/types.ts` (defines `GoldenLineRow`)
- Test: `tests/backtest/golden-repo.test.ts` (integration — hits the cloud DB via `serviceClient()`)

**Interfaces:**
- Consumes: `serviceClient()`.
- Produces: `insertGoldenCase`, `insertGoldenLines`, `getCaseBySlug`, `listScoredCases`, `saveBacktestRun`, `getRunsByLabel`; and the `GoldenLineRow` type consumed by `score.ts`.

- [ ] **Step 1: Define the types**

```ts
// src/lib/backtest/types.ts
export interface GoldenLineRow {
  sortOrder: number;
  itemCode: string | null;
  descriptionOriginal: string;
  unitCanonical: string | null;
  truthRateFils: number | null;
  truthAmountFils: number | null;
  trade: string | null;
}
```

- [ ] **Step 2: Write the failing integration test**

```ts
// tests/backtest/golden-repo.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { insertGoldenCase, insertGoldenLines, getCaseBySlug, listScoredCases } from "@/lib/db/golden";
import { serviceClient } from "@/lib/db/client";

const SLUG = "test-case-" + "aa11";  // fixed literal; no Date/Math.random in tests

describe("golden repo", () => {
  afterAll(async () => { await serviceClient().from("golden_cases").delete().eq("slug", SLUG); });

  it("inserts and reads back a scored case with lines", async () => {
    const { id } = await insertGoldenCase({
      slug: SLUG, nameAr: "اختبار", projectType: "civil",
      inputPath: "x.xlsx", pricedPath: "x.xlsx", profileSlug: "civil", truthSource: "priced-tender",
    });
    await insertGoldenLines(id, [
      { sortOrder: 0, itemCode: "1", descriptionOriginal: "concrete", unitCanonical: "m3", truthRateFils: 9000, truthAmountFils: 90000, trade: "concrete" },
    ]);
    const c = await getCaseBySlug(SLUG);
    expect(c?.pricedPath).toBe("x.xlsx");
    const scored = await listScoredCases();
    expect(scored.some((s) => s.slug === SLUG)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/backtest/golden-repo.test.ts`
Expected: FAIL — `@/lib/db/golden` not found.

- [ ] **Step 4: Implement the repo**

```ts
// src/lib/db/golden.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "./client";
import type { GoldenLineRow } from "@/lib/backtest/types";

export interface GoldenCaseInput {
  slug: string; nameAr: string; projectType: string;
  inputPath: string; pricedPath: string | null; profileSlug: string;
  truthSource: "priced-tender" | "actual-outturn" | "none"; projectId?: string | null;
}

export async function insertGoldenCase(c: GoldenCaseInput, db: SupabaseClient = serviceClient()): Promise<{ id: string }> {
  const { data, error } = await db.from("golden_cases").insert({
    slug: c.slug, name_ar: c.nameAr, project_type: c.projectType,
    input_path: c.inputPath, priced_path: c.pricedPath, profile_slug: c.profileSlug,
    project_id: c.projectId ?? null, truth_source: c.truthSource,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return { id: data.id };
}

export async function insertGoldenLines(caseId: string, lines: (GoldenLineRow & { itemCode?: string | null })[], db: SupabaseClient = serviceClient()): Promise<void> {
  if (lines.length === 0) return;
  const rows = lines.map((l) => ({
    case_id: caseId, sort_order: l.sortOrder, item_code: l.itemCode ?? null,
    description_original: l.descriptionOriginal, unit_canonical: l.unitCanonical,
    quantity_thousandths: null, truth_rate_fils: l.truthRateFils, truth_amount_fils: l.truthAmountFils,
    trade: l.trade, truth_source: "priced-tender",
  }));
  const { error } = await db.from("golden_lines").insert(rows);
  if (error) throw new Error(error.message);
}

export async function getCaseBySlug(slug: string, db: SupabaseClient = serviceClient()) {
  const { data } = await db.from("golden_cases").select("*").eq("slug", slug).maybeSingle();
  if (!data) return null;
  return { id: data.id, slug: data.slug, projectType: data.project_type, inputPath: data.input_path,
    pricedPath: data.priced_path, profileSlug: data.profile_slug, truthSource: data.truth_source, projectId: data.project_id };
}

export async function getGoldenLines(caseId: string, db: SupabaseClient = serviceClient()): Promise<GoldenLineRow[]> {
  const { data, error } = await db.from("golden_lines").select("*").eq("case_id", caseId).order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ sortOrder: r.sort_order, itemCode: r.item_code, descriptionOriginal: r.description_original,
    unitCanonical: r.unit_canonical, truthRateFils: r.truth_rate_fils == null ? null : Number(r.truth_rate_fils),
    truthAmountFils: r.truth_amount_fils == null ? null : Number(r.truth_amount_fils), trade: r.trade }));
}

export async function listScoredCases(db: SupabaseClient = serviceClient()) {
  const { data } = await db.from("golden_cases").select("*").neq("truth_source", "none").order("slug");
  return (data ?? []).map((d) => ({ id: d.id, slug: d.slug, projectType: d.project_type, inputPath: d.input_path,
    pricedPath: d.priced_path, profileSlug: d.profile_slug }));
}

export async function saveBacktestRun(input: { caseId: string; label: string | null; config: object; summary: object }, db: SupabaseClient = serviceClient()): Promise<{ id: string }> {
  const { data, error } = await db.from("backtest_runs").insert({ case_id: input.caseId, label: input.label, config: input.config, summary: input.summary }).select("id").single();
  if (error) throw new Error(error.message);
  return { id: data.id };
}

export async function getRunsByLabel(label: string, db: SupabaseClient = serviceClient()) {
  const { data } = await db.from("backtest_runs").select("*").eq("label", label).order("scored_at", { ascending: false });
  return data ?? [];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/backtest/golden-repo.test.ts`
Expected: PASS (deletes the test case in `afterAll`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/golden.ts src/lib/backtest/types.ts tests/backtest/golden-repo.test.ts
git commit -m "feat(db): golden-set + backtest-run repository"
```

---

### Task 7: Alignment — `normalize.ts` + `align.ts`

**Files:**
- Create: `src/lib/backtest/normalize.ts`
- Create: `src/lib/backtest/align.ts`
- Test: `tests/backtest/align.test.ts`

**Interfaces:**
- Consumes: `GoldenLineRow` (Task 6).
- Produces: `normDesc`, `normCode`, `jaccardGe`; `alignLines(priced, golden): AlignedPair[]` — the two-pass matcher (§6.1). An `AlignedPair` links a priced-row `position` to a golden `sortOrder` (or marks one side unmatched).

- [ ] **Step 1: Write the failing test**

```ts
// tests/backtest/align.test.ts
import { describe, it, expect } from "vitest";
import { normDesc, normCode, jaccardGe, alignLines } from "@/lib/backtest/align";

describe("normalization", () => {
  it("normCode strips non-alphanumerics and uppercases", () => {
    expect(normCode("2/1")).toBe("21");
    expect(normCode(" a-1 ")).toBe("A1");
    expect(normCode("")).toBe("");
  });
  it("jaccardGe compares token-set overlap as an integer ratio", () => {
    expect(jaccardGe("supply c30 concrete", "supply c30 concrete m3", 60)).toBe(true);
    expect(jaccardGe("supply concrete", "install ceramic tile", 60)).toBe(false);
  });
});

describe("alignLines", () => {
  const golden = [
    { sortOrder: 0, itemCode: "1", descriptionOriginal: "Supply C30 concrete", unitCanonical: "m3", truthRateFils: 9000, truthAmountFils: null, trade: "concrete" },
    { sortOrder: 1, itemCode: null, descriptionOriginal: "Blockwork 200mm hollow", unitCanonical: "m2", truthRateFils: 8500, truthAmountFils: null, trade: "blockwork" },
  ];
  it("pass 1 matches on exact item code", () => {
    const priced = [{ position: 0, itemCode: "1", descriptionOriginal: "different text", unitCanonical: "m3", rateFils: 9100, flags: [] }];
    const pairs = alignLines(priced, golden);
    expect(pairs.find((p) => p.position === 0)?.sortOrder).toBe(0);
  });
  it("pass 2 falls back to description similarity when code is blank", () => {
    const priced = [{ position: 0, itemCode: undefined, descriptionOriginal: "Blockwork 200mm hollow block", unitCanonical: "m2", rateFils: 8600, flags: [] }];
    const pairs = alignLines(priced, golden);
    expect(pairs.find((p) => p.position === 0)?.sortOrder).toBe(1);
  });
  it("blank code never counts as an exact match", () => {
    const priced = [{ position: 0, itemCode: "", descriptionOriginal: "totally unrelated widget", unitCanonical: "nr", rateFils: 1, flags: [] }];
    const pairs = alignLines(priced, golden);
    expect(pairs.find((p) => p.position === 0)?.sortOrder ?? null).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/backtest/align.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `normalize.ts`**

```ts
// src/lib/backtest/normalize.ts
export function normDesc(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "")     // Arabic diacritics + tatweel
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function normCode(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export function jaccardGe(a: string, b: string, pct: number): boolean {
  const ta = new Set(normDesc(a).split(" ").filter(Boolean));
  const tb = new Set(normDesc(b).split(" ").filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return inter * 100 >= pct * union;   // integer comparison, no floats
}
```

- [ ] **Step 4: Implement `align.ts`** (re-exports the normalize helpers)

```ts
// src/lib/backtest/align.ts
import type { GoldenLineRow } from "./types";
import { normCode, normDesc, jaccardGe } from "./normalize";
export { normCode, normDesc, jaccardGe };

export interface PricedLineForAlign {
  position: number; itemCode?: string; descriptionOriginal: string; unitCanonical: string | null; rateFils: number | null; flags: string[];
}
export interface AlignedPair { position: number; sortOrder: number | null; }

export function alignLines(priced: PricedLineForAlign[], golden: GoldenLineRow[]): AlignedPair[] {
  const usedGolden = new Set<number>();
  const pairs: AlignedPair[] = [];
  const unmatchedPriced: PricedLineForAlign[] = [];

  // Pass 1 — exact code
  for (const p of priced) {
    const pc = normCode(p.itemCode);
    if (pc === "") { unmatchedPriced.push(p); continue; }
    const candidates = golden.filter((g) => !usedGolden.has(g.sortOrder) && normCode(g.itemCode) !== "" && normCode(g.itemCode) === pc);
    if (candidates.length === 0) { unmatchedPriced.push(p); continue; }
    candidates.sort((a, b) => Math.abs(p.position - a.sortOrder) - Math.abs(p.position - b.sortOrder) || a.sortOrder - b.sortOrder);
    usedGolden.add(candidates[0].sortOrder);
    pairs.push({ position: p.position, sortOrder: candidates[0].sortOrder });
  }

  // Pass 2 — description Jaccard >= 0.60, greedy, one-to-one
  for (const p of unmatchedPriced) {
    const candidates = golden
      .filter((g) => !usedGolden.has(g.sortOrder) && jaccardGe(p.descriptionOriginal, g.descriptionOriginal, 60))
      .sort((a, b) => {
        const ua = a.unitCanonical === p.unitCanonical ? 0 : 1;
        const ub = b.unitCanonical === p.unitCanonical ? 0 : 1;
        return ua - ub || Math.abs(p.position - a.sortOrder) - Math.abs(p.position - b.sortOrder) || a.sortOrder - b.sortOrder;
      });
    if (candidates.length === 0) { pairs.push({ position: p.position, sortOrder: null }); continue; }
    usedGolden.add(candidates[0].sortOrder);
    pairs.push({ position: p.position, sortOrder: candidates[0].sortOrder });
  }
  return pairs;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/backtest/align.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/backtest/normalize.ts src/lib/backtest/align.ts tests/backtest/align.test.ts
git commit -m "feat(backtest): two-pass deterministic line alignment"
```

---

### Task 8: Scoring — `score.ts` (bps metrics)

**Files:**
- Create: `src/lib/backtest/score.ts`
- Test: `tests/backtest/score.test.ts`

**Interfaces:**
- Consumes: `alignLines` (Task 7), `roundHalfAwayFromZero` (Task 1), `parseJDToFils` (money.ts), `PricedRow` (priced-boq.ts), `GoldenLineRow` (Task 6).
- Produces: `scoreQuote({ pricedRows, goldenLines }): ScoreSummary` (see the Interfaces-Produced block).

- [ ] **Step 1: Write the failing test**

```ts
// tests/backtest/score.test.ts
import { describe, it, expect } from "vitest";
import { scoreQuote } from "@/lib/backtest/score";
import type { PricedRow } from "@/lib/export/priced-boq";
import type { GoldenLineRow } from "@/lib/backtest/types";

const golden: GoldenLineRow[] = [
  { sortOrder: 0, itemCode: "1", descriptionOriginal: "Supply C30 concrete", unitCanonical: "m3", truthRateFils: 10000, truthAmountFils: 100000, trade: "concrete" },
  { sortOrder: 1, itemCode: "2", descriptionOriginal: "Blockwork", unitCanonical: "m2", truthRateFils: 10000, truthAmountFils: 40000, trade: "blockwork" },
];

it("computes signed bps error and within-bands", () => {
  const rows: PricedRow[] = [
    { itemCode: "1", sectionRef: "A", description: "Supply C30 concrete", unit: "m3", quantity: "10", rateJD: "10.500", amountJD: "105.000", flags: [] }, // +5% -> +500 bps
    { itemCode: "2", sectionRef: "A", description: "Blockwork", unit: "m2", quantity: "4", rateJD: "13.000", amountJD: "52.000", flags: [] },           // +30% -> +3000 bps
  ];
  const s = scoreQuote({ pricedRows: rows, goldenLines: golden });
  expect(s.lines.find((l) => l.position === 0)?.eBps).toBe(500);
  expect(s.lines.find((l) => l.position === 1)?.eBps).toBe(3000);
  expect(s.within5).toBe(50);          // 1 of 2 lines within +/-5%
  expect(s.within10).toBe(50);
  expect(s.medianAbsBps).toBe(1750);   // median of [500, 3000] -> (500+3000)/2 = 1750
  expect(s.grandTotalDevBps).toBe(1214); // (157000-140000)/140000 = 12.14% -> 1214 bps
});

it("excludes NO_MATCH / NEEDS_MANUAL lines from rate accuracy (coverage only)", () => {
  const rows: PricedRow[] = [
    { itemCode: "1", sectionRef: "A", description: "Supply C30 concrete", unit: "m3", quantity: "10", rateJD: null, amountJD: null, flags: ["NO_MATCH"] },
  ];
  const s = scoreQuote({ pricedRows: rows, goldenLines: golden });
  expect(s.medianAbsBps).toBeNull();   // no priced lines -> null, never 0
  expect(s.coverage).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/backtest/score.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `score.ts`**

```ts
// src/lib/backtest/score.ts
import { roundHalfAwayFromZero } from "@/lib/domain/money";
import { parseJDToFils } from "@/lib/domain/money";
import type { PricedRow } from "@/lib/export/priced-boq";
import type { GoldenLineRow } from "./types";
import { alignLines, type PricedLineForAlign } from "./align";
import type { ScoreSummary, ScoredLine, TradeMetrics } from "./types";

const UNPRICED_FLAGS = new Set(["NO_MATCH", "NEEDS_MANUAL"]);

function pctInt(numer: number, denom: number): number {
  if (denom === 0) return 0;
  return Number(roundHalfAwayFromZero(BigInt(numer) * 100n, BigInt(denom)));
}

export function scoreQuote(input: { pricedRows: PricedRow[]; goldenLines: GoldenLineRow[] }): ScoreSummary {
  const priced: PricedLineForAlign[] = input.pricedRows.map((r, i) => ({
    position: i, itemCode: r.itemCode, descriptionOriginal: r.description,
    unitCanonical: (r.unit ?? null) as string | null,
    rateFils: r.rateJD == null ? null : parseJDToFils(r.rateJD), flags: r.flags,
  }));
  const pairs = alignLines(priced, input.goldenLines);
  const goldenBySort = new Map(input.goldenLines.map((g) => [g.sortOrder, g]));

  const lines: ScoredLine[] = [];
  const absErrs: number[] = [];
  const signedErrs: number[] = [];
  let estAmount = 0n, truthAmount = 0n;
  const byTradeAcc = new Map<string, number[]>();
  let pricedCount = 0, pricedAligned = 0;

  for (const p of priced) {
    const pair = pairs.find((x) => x.position === p.position)!;
    const g = pair.sortOrder == null ? undefined : goldenBySort.get(pair.sortOrder);
    const isPriced = p.rateFils != null && !p.flags.some((f) => UNPRICED_FLAGS.has(f));
    if (isPriced) pricedCount++;
    let eBps: number | null = null;
    if (isPriced && g && g.truthRateFils != null && g.truthRateFils !== 0) {
      pricedAligned++;
      eBps = Number(roundHalfAwayFromZero(BigInt(p.rateFils! - g.truthRateFils) * 10000n, BigInt(g.truthRateFils)));
      absErrs.push(Math.abs(eBps));
      signedErrs.push(eBps);
      const t = g.trade ?? "__untraded__";
      if (!byTradeAcc.has(t)) byTradeAcc.set(t, []);
      byTradeAcc.get(t)!.push(eBps);
      // grand-total: sum estimated amount (rate*qty in fils) vs truth amount, over aligned priced lines
      const row = input.pricedRows[p.position];
      if (row.amountJD != null) estAmount += BigInt(parseJDToFils(row.amountJD));
      if (g.truthAmountFils != null) truthAmount += BigInt(g.truthAmountFils);
    }
    lines.push({ position: p.position, matched: pair.sortOrder != null, priced: isPriced, eBps });
  }

  return {
    within5: pctInt(absErrs.filter((e) => e <= 500).length, absErrs.length),
    within10: pctInt(absErrs.filter((e) => e <= 1000).length, absErrs.length),
    within20: pctInt(absErrs.filter((e) => e <= 2000).length, absErrs.length),
    medianAbsBps: median(absErrs),
    meanSignedBps: signedErrs.length ? Number(roundHalfAwayFromZero(BigInt(signedErrs.reduce((a, b) => a + b, 0)), BigInt(signedErrs.length))) : null,
    grandTotalDevBps: truthAmount === 0n ? null : Number(roundHalfAwayFromZero((estAmount - truthAmount) * 10000n, truthAmount)),
    coverage: pctInt(pricedAligned, pricedCount),
    byTrade: buildByTrade(byTradeAcc),
    lines,
  };
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Number(roundHalfAwayFromZero(BigInt(s[mid - 1] + s[mid]), 2n));
}

function buildByTrade(acc: Map<string, number[]>): Record<string, TradeMetrics> {
  const out: Record<string, TradeMetrics> = {};
  for (const [trade, errs] of acc) {
    const abs = errs.map((e) => Math.abs(e));
    out[trade] = {
      within5: pctInt(abs.filter((e) => e <= 500).length, abs.length),
      within10: pctInt(abs.filter((e) => e <= 1000).length, abs.length),
      within20: pctInt(abs.filter((e) => e <= 2000).length, abs.length),
      medianAbsBps: median(abs),
      meanSignedBps: Number(roundHalfAwayFromZero(BigInt(errs.reduce((a, b) => a + b, 0)), BigInt(errs.length))),
      count: errs.length,
    };
  }
  return out;
}
```

Add `ScoredLine`, `TradeMetrics`, `ScoreSummary` to `src/lib/backtest/types.ts` (verbatim from the Interfaces-Produced block).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/backtest/score.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/backtest/score.ts src/lib/backtest/types.ts tests/backtest/score.test.ts
git commit -m "feat(backtest): bps scoring engine (per-line/per-trade/grand-total)"
```

---

### Task 9: `runPipeline` config-pin extension

**Files:**
- Modify: `src/lib/db/skills.ts` (add `getSkillVersionById`, `getProfileVersionById`)
- Modify: `src/lib/pipeline/assemble.ts` (thread `overrides`)
- Modify: `src/lib/pipeline/run.ts` (accept `overrides`, `skillVersions`, `profileVersionId`)
- Test: `tests/backtest/run-config.test.ts`

**Interfaces:**
- Consumes: existing `runPipeline`, `assembleAndPrice`, `priceQuote` (already has `overrides?`), `getActiveSkill`/`getActiveProfile`.
- Produces: `runPipeline` input `+ overrides?`, `+ skillVersions?: Record<string, string>`, `+ profileVersionId?`; `getSkillVersionById`/`getProfileVersionById`. Defaults preserve current behaviour (all three optional; absent = use active versions, no overrides).

- [ ] **Step 1: Write the failing test** (unit: assert the wiring is inert by default)

```ts
// tests/backtest/run-config.test.ts
import { describe, it, expect } from "vitest";
import { assembleAndPrice } from "@/lib/pipeline/assemble";
// Build a minimal item+skill+snapshot inline and assert that passing overrides:undefined
// yields the same rollup as omitting it (the param must be genuinely optional/inert).
```

Write a small deterministic `assembleAndPrice` call (one matched item, one skill with a single labor component, a two-entry snapshot) once **with** `overrides: undefined` and once **without** the key, asserting `rollup.grandTotalFils` is identical. This locks that the new param is inert by default.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/backtest/run-config.test.ts`
Expected: FAIL — `assembleAndPrice` does not yet accept `overrides`.

- [ ] **Step 3: Add the DB helpers**

```ts
// src/lib/db/skills.ts  (append; mirror getActiveSkill's shape)
export async function getSkillVersionById(skillId: string, versionId: string, db: SupabaseClient = serviceClient()) {
  const { data } = await db.from("skill_versions").select("content, id").eq("skill_id", skillId).eq("id", versionId).maybeSingle();
  return data ? { content: data.content as SkillContent, versionId: data.id as string } : null;
}
export async function getProfileVersionById(profileId: string, versionId: string, db: SupabaseClient = serviceClient()) {
  const { data } = await db.from("profile_versions").select("content, id").eq("profile_id", profileId).eq("id", versionId).maybeSingle();
  return data ? { content: data.content as ProfileContent, versionId: data.id as string } : null;
}
```

- [ ] **Step 4: Thread `overrides` through `assembleAndPrice`**

In `src/lib/pipeline/assemble.ts`, add `overrides?: ProjectOverrides` to the input object and forward it into the `priceQuote({ ..., overrides })` call (the param already exists on `priceQuote`). Import `ProjectOverrides` from `@/lib/domain/overrides`.

- [ ] **Step 5: Thread through `runPipeline`**

In `src/lib/pipeline/run.ts`, add `overrides?: ProjectOverrides; skillVersions?: Record<string, string>; profileVersionId?: string;` to the input. When `skillVersions[trade]` is present, load that version via `getSkillVersionById` instead of `getActiveSkill`; same for `profileVersionId` via `getProfileVersionById`; otherwise fall back to the active versions (current behaviour). Forward `overrides` into `assembleAndPrice`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/backtest/run-config.test.ts`
Expected: PASS. Also run `npx vitest run tests/pipeline` — Expected: PASS (no regression).

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/skills.ts src/lib/pipeline/assemble.ts src/lib/pipeline/run.ts tests/backtest/run-config.test.ts
git commit -m "feat(pipeline): config-pin runPipeline (overrides + skillVersions) for backtest"
```

---

### Task 10: `AlSafi_Civil.unpriced.xlsx` fixture + profile seed script

**Files:**
- Create: `reference-docs/test-boqs/AlSafi_Civil.unpriced.xlsx` (committed)
- Create: `scripts/seed-profiles.ts`
- Create: `scripts/make-alsafi-unpriced.ts` (one-off; committed for reproducibility)

**Interfaces:**
- Consumes: `ingestExcel`, `createProfile`/`createProfileVersion`/`activateProfileVersion`, `getActiveProfile`.
- Produces: the price-stripped AlSafi input; a committed `civil` profile (and `mep`, `architectural` stubs) seeded + activated so `runPipeline` doesn't throw «غير مفعّل».

- [ ] **Step 1: Create the unpriced-copy script**

```ts
// scripts/make-alsafi-unpriced.ts
import "./_env";
import xlsx from "xlsx";
const wb = xlsx.readFile("reference-docs/test-boqs/AlSafi_Civil.xlsx");
const ws = wb.Sheets[wb.SheetNames[0]];
// Delete columns E ("Unit Price") and F ("Total price") by rewriting rows without them.
const rows = xlsx.utils.sheet_to_json<string[]>(ws, { header: 1, raw: true });
const stripped = rows.map((r) => r.filter((_, i) => i !== 4 && i !== 5));  // drop col index 4 (E) and 5 (F)
const outWs = xlsx.utils.aoa_to_sheet(stripped);
const outWb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(outWb, outWs, wb.SheetNames[0]);
xlsx.writeFile(outWb, "reference-docs/test-boqs/AlSafi_Civil.unpriced.xlsx");
console.log("wrote AlSafi_Civil.unpriced.xlsx");
```

Run: `npx tsx scripts/make-alsafi-unpriced.ts` then verify with `ingestExcel(...)` (no readPrices) that no price columns are detected.

- [ ] **Step 2: Create the profile seed script**

```ts
// scripts/seed-profiles.ts
import "./_env";
import { createProfile, createProfileVersion, activateProfileVersion, getActiveProfile } from "../src/lib/db/skills";

// Enumerate the trade-skill slugs each profile needs (must already exist as trade_skills).
const PROFILES: Record<string, string[]> = {
  civil: ["concrete", "blockwork", "plastering", "tiling", "excavation"],
  mep: ["plumbing", "electrical", "hvac"],
  architectural: ["tiling", "painting", "doors-windows", "false-ceiling"],
};

for (const [slug, trades] of Object.entries(PROFILES)) {
  const existing = await getActiveProfile(slug);
  if (existing) { console.log(`${slug}: already active`); continue; }
  const { id } = await createProfile(slug, slug, undefined);          // nameAr = slug for now
  const { versionId } = await createProfileVersion(id, { trades, ratioChecks: [] }, "seed", undefined);
  await activateProfileVersion(id, versionId, undefined);
  console.log(`${slug}: seeded + activated with trades ${trades.join(", ")}`);
}
```

> The trade-skill slugs listed must already exist (Phase-2 seeding). If a slug is missing, the profile still activates but `runPipeline` will simply not match that trade — acceptable for the harness; note any missing trades in the run output.

- [ ] **Step 3: Run the seed**

Run: `npx tsx scripts/seed-profiles.ts`
Expected: prints seeded/activated (or "already active") for each profile.

- [ ] **Step 4: Commit**

```bash
git add reference-docs/test-boqs/AlSafi_Civil.unpriced.xlsx scripts/make-alsafi-unpriced.ts scripts/seed-profiles.ts
git commit -m "feat(backtest): AlSafi unpriced input + project-type profile seeds"
```

---

### Task 11: `register-golden.ts` — the case registry

**Files:**
- Create: `scripts/register-golden.ts`

**Interfaces:**
- Consumes: `insertGoldenCase` (Task 6), `fs.existsSync`.
- Produces: the 4 scored cases + 3 candidate cases inserted into `golden_cases`, with a hard `fs.existsSync` guard on every path.

- [ ] **Step 1: Write the registry script**

```ts
// scripts/register-golden.ts
import "./_env";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { insertGoldenCase, getCaseBySlug, type GoldenCaseInput } from "../src/lib/db/golden";

const SCORED: GoldenCaseInput[] = [
  { slug: "omar-matar-9b-civil", nameAr: "عمر مطر 9ب مدني", projectType: "civil",
    inputPath: "reference-docs/Omar Matar Street without price.pdf",
    pricedPath: "reference-docs/Package 8 & 9 B Omar Matar Street with price.pdf", profileSlug: "civil", truthSource: "priced-tender" },
  { slug: "omar-matar-9a-structural-mep", nameAr: "عمر مطر 9أ إنشائي وميكانيك", projectType: "mep",
    inputPath: "reference-docs/Omar Matar Street without price.pdf",
    pricedPath: "reference-docs/Package 9 A Structural & MEP Works priced.pdf", profileSlug: "mep", truthSource: "priced-tender" },
  { slug: "omar-matar-9a-architectural", nameAr: "عمر مطر 9أ معماري", projectType: "architectural",
    inputPath: "reference-docs/Omar Matar Street without price.pdf",
    pricedPath: "reference-docs/Package 9A Architectural  Works priced.pdf",   // TWO spaces before Works
    profileSlug: "architectural", truthSource: "priced-tender" },
  { slug: "alsafi-civil", nameAr: "الصافي مدني", projectType: "civil",
    inputPath: "reference-docs/test-boqs/AlSafi_Civil.unpriced.xlsx",
    pricedPath: "reference-docs/test-boqs/AlSafi_Civil.xlsx", profileSlug: "civil", truthSource: "priced-tender" },
];

const CANDIDATES: GoldenCaseInput[] = [
  { slug: "labs-fitout", nameAr: "مختبرات", projectType: "labs", inputPath: "reference-docs/test-boqs/Labs.xlsx", pricedPath: null, profileSlug: "civil", truthSource: "none" },
  { slug: "jah-amman", nameAr: "مستشفى", projectType: "hospital", inputPath: "reference-docs/test-boqs/JAH_Amman.xlsx", pricedPath: null, profileSlug: "civil", truthSource: "none" },
  { slug: "fountain-square", nameAr: "فاونتن سكوير", projectType: "infrastructure", inputPath: "reference-docs/Fountain Square Bill 1 & 2 without price.pdf", pricedPath: null, profileSlug: "civil", truthSource: "none" },
];

for (const c of [...SCORED, ...CANDIDATES]) {
  if (!existsSync(resolve(process.cwd(), c.inputPath))) throw new Error(`input_path missing: ${c.inputPath}`);
  if (c.pricedPath && !existsSync(resolve(process.cwd(), c.pricedPath))) throw new Error(`priced_path missing: ${c.pricedPath}`);
  if (await getCaseBySlug(c.slug)) { console.log(`${c.slug}: exists, skip`); continue; }
  await insertGoldenCase(c);
  console.log(`${c.slug}: registered`);
}
```

- [ ] **Step 2: Run it**

Run: `npx tsx scripts/register-golden.ts`
Expected: registers each case; **fails loudly** if any file path is wrong (the double-space filename is the key trap).

- [ ] **Step 3: Commit**

```bash
git add scripts/register-golden.ts
git commit -m "feat(backtest): golden-case registry with fs.existsSync guard"
```

---

### Task 12: `golden-build.ts` — parse priced_path → golden_lines (+ trade resolution)

**Files:**
- Create: `scripts/golden-build.ts`

**Interfaces:**
- Consumes: `getCaseBySlug`, `insertGoldenLines`, `ingestExcel`/`ingestPdf` (readPrices), `batchTagLines`/`batchMatchLines`, `getActiveProfile`/`getActiveSkill`, `claudeCliAdapter`, `parsePriceToFils`/`parseJDNumberToFils`.
- Produces: `golden_lines` for a case, each with `truth_rate_fils`/`truth_amount_fils` and a resolved `trade`.

- [ ] **Step 1: Write the build script**

```ts
// scripts/golden-build.ts
import "./_env";
import { claudeCliAdapter } from "../src/lib/ai/claude-cli";
import { getCaseBySlug, insertGoldenLines } from "../src/lib/db/golden";
import { getActiveProfile, getActiveSkill } from "../src/lib/db/skills";
import { ingestExcel } from "../src/lib/ingest/excel";
import { ingestPdf } from "../src/lib/ingest/pdf";
import { batchTagLines, batchMatchLines } from "../src/lib/pipeline/batch";
import type { PricedExtractionResult } from "../src/lib/ingest/types";

const slug = process.argv[process.argv.indexOf("--case") + 1];
const c = await getCaseBySlug(slug);
if (!c) throw new Error(`no case ${slug}`);
if (!c.pricedPath) throw new Error(`case ${slug} has no priced_path (truth_source=none)`);

const adapter = claudeCliAdapter({ timeoutMs: 240_000 });
const isExcel = c.pricedPath.toLowerCase().endsWith(".xlsx");
const res = (isExcel
  ? ingestExcel(c.pricedPath, { readPrices: true })
  : await ingestPdf(c.pricedPath, adapter, { readPrices: true })) as PricedExtractionResult;

// Build-time guard: refuse a pipeline-output artifact.
const nullRate = res.lines.filter((l) => l.truthRateFils == null).length;
if (nullRate > res.lines.length * 0.5) throw new Error(`>50% null truth rates in ${c.pricedPath} — is this a pipeline OUTPUT, not human truth?`);

// Trade resolution: tag + match against the case's active profile skills (§5.2).
const profile = await getActiveProfile(c.profileSlug);
const tradeByIndex = new Array<string | null>(res.lines.length).fill(null);
if (profile) {
  for (const tradeSlug of profile.content.trades) {
    const skill = await getActiveSkill(tradeSlug);
    if (!skill) continue;
    const tags = await batchTagLines(adapter, tradeSlug, res.lines);
    const matches = await batchMatchLines(adapter, tradeSlug, skill.content,
      res.lines.map((l, i) => ({ rawText: l.descriptionOriginal, tags: tags[i] })));
    matches.forEach((m, i) => { if (m && tradeByIndex[i] == null) tradeByIndex[i] = tradeSlug; });
  }
}

await insertGoldenLines(c.id, res.lines.map((l, i) => ({
  sortOrder: l.sortOrder, itemCode: l.itemCode ?? null, descriptionOriginal: l.descriptionOriginal,
  unitCanonical: (l.unitRaw ?? null) as string | null,
  truthRateFils: l.truthRateFils ?? null, truthAmountFils: l.truthAmountFils ?? null, trade: tradeByIndex[i],
})));
console.log(`${slug}: ${res.lines.length} golden lines written`);
```

- [ ] **Step 2: Run it for AlSafi (fast, Excel — no PDF vision)**

Run: `npx tsx scripts/golden-build.ts --case alsafi-civil`
Expected: writes ~87 golden lines; prints the count. (Runs AI for trade resolution — may take a few minutes.)

- [ ] **Step 3: Spot-check in the DB**

Query `golden_lines` for the case via a throwaway `serviceClient()` snippet: confirm `truth_rate_fils` is populated (porcelain ≈ 9000, block ≈ 8500) and `trade` is non-null on matched lines.

- [ ] **Step 4: Commit**

```bash
git add scripts/golden-build.ts
git commit -m "feat(backtest): golden-build — parse priced doc + resolve trades into golden_lines"
```

---

### Task 13: `backtest.ts` — re-price, score, persist, compare

**Files:**
- Create: `scripts/backtest.ts`
- Modify: `package.json` (add `golden:build`, `backtest` scripts)

**Interfaces:**
- Consumes: `runPipeline` (Task 9), `scoreQuote` (Task 8), `getGoldenLines`/`listScoredCases`/`getCaseBySlug`/`saveBacktestRun`/`getRunsByLabel` (Task 6), `claudeCliAdapter`.
- Produces: `npm run backtest` with `--case`, `--label`, `--compare`; persists a `backtest_runs` row per case.

- [ ] **Step 1: Add package.json scripts**

```json
// package.json "scripts"
"golden:build": "tsx scripts/golden-build.ts",
"backtest": "tsx scripts/backtest.ts"
```

- [ ] **Step 2: Write the backtest script**

```ts
// scripts/backtest.ts
import "./_env";
import { claudeCliAdapter } from "../src/lib/ai/claude-cli";
import { runPipeline } from "../src/lib/pipeline/run";
import { scoreQuote } from "../src/lib/backtest/score";
import { getGoldenLines, listScoredCases, getCaseBySlug, saveBacktestRun, getRunsByLabel } from "../src/lib/db/golden";

const argv = process.argv;
const caseArg = argv.includes("--case") ? argv[argv.indexOf("--case") + 1] : null;
const label = argv.includes("--label") ? argv[argv.indexOf("--label") + 1] : null;
const compare = argv.includes("--compare") ? [argv[argv.indexOf("--compare") + 1], argv[argv.indexOf("--compare") + 2]] : null;

if (compare) { await runCompare(compare[0], compare[1]); process.exit(0); }

const adapter = claudeCliAdapter({ timeoutMs: 240_000 });
const cases = caseArg
  ? [await getCaseBySlug(caseArg).then((c) => { if (!c) throw new Error(`no case ${caseArg}`); if (c.truthSource === "none") throw new Error(`case ${caseArg} has no ground truth`); return c; })]
  : await listScoredCases();

for (const c of cases) {
  const priced = await runPipeline({ file: c.inputPath, profileSlug: c.profileSlug, adapter });
  const golden = await getGoldenLines(c.id);
  const summary = scoreQuote({ pricedRows: priced.rows, goldenLines: golden });
  await saveBacktestRun({ caseId: c.id, label, config: { asOf: null }, summary });
  console.log(`${c.slug} [${c.projectType}]  within10=${summary.within10}%  median=${summary.medianAbsBps}bps  grandTotalDev=${summary.grandTotalDevBps}bps  coverage=${summary.coverage}%`);
}

async function runCompare(a: string, b: string) {
  const ra = await getRunsByLabel(a), rb = await getRunsByLabel(b);
  // For each case present in both labels, diff medianAbsBps + grandTotalDevBps and print improved/regressed/neutral.
  const byCaseB = new Map(rb.map((r) => [r.case_id, r]));
  for (const r of ra) {
    const other = byCaseB.get(r.case_id);
    if (!other) continue;
    const dMed = (other.summary.medianAbsBps ?? 0) - (r.summary.medianAbsBps ?? 0);
    const dGt = Math.abs(other.summary.grandTotalDevBps ?? 0) - Math.abs(r.summary.grandTotalDevBps ?? 0);
    const verdict = dMed < 0 || dGt < 0 ? "improved" : dMed > 0 || dGt > 0 ? "regressed" : "neutral";
    console.log(`case ${r.case_id}: median ${dMed >= 0 ? "+" : ""}${dMed}bps, grandTotalDev ${dGt >= 0 ? "+" : ""}${dGt}bps → ${verdict}`);
  }
}
```

- [ ] **Step 3: Run the baseline (AlSafi) in the background**

Run: `npm run backtest -- --case alsafi-civil --label baseline`
Expected: prints one summary line; persists a `backtest_runs` row labelled `baseline`. (Background it — AI-bound.)

- [ ] **Step 4: Commit**

```bash
git add scripts/backtest.ts package.json
git commit -m "feat(backtest): backtest runner + A/B compare + baseline run"
```

---

### Task 14: AlSafi snapshot regression test

**Files:**
- Create: `tests/fixtures/alsafi-snapshot.json` (committed — the actual scored summary from Task 13's baseline)
- Test: `tests/backtest/alsafi-snapshot.test.ts`

**Interfaces:**
- Consumes: `scoreQuote`, `getGoldenLines`, `getCaseBySlug`, a **stored** priced-rows fixture (so the test is deterministic and doesn't re-run AI).
- Produces: a bps-exact regression lock on our own headline result.

- [ ] **Step 1: Capture the priced rows once**

After Task 13's baseline run, dump the exact `priced.rows` for `alsafi-civil` to `tests/fixtures/alsafi-priced-rows.json` (add a `--dump-rows <path>` flag to `backtest.ts`, or a throwaway snippet). Commit it. This freezes the AI output so the score test is deterministic.

- [ ] **Step 2: Write the snapshot test**

```ts
// tests/backtest/alsafi-snapshot.test.ts
import { describe, it, expect } from "vitest";
import { scoreQuote } from "@/lib/backtest/score";
import pricedRows from "../fixtures/alsafi-priced-rows.json";
import goldenLines from "../fixtures/alsafi-golden-lines.json";  // dumped from getGoldenLines once
import snapshot from "../fixtures/alsafi-snapshot.json";

it("reproduces the committed AlSafi score summary bps-exact", () => {
  const s = scoreQuote({ pricedRows: pricedRows as any, goldenLines: goldenLines as any });
  expect({ within5: s.within5, within10: s.within10, within20: s.within20, medianAbsBps: s.medianAbsBps, grandTotalDevBps: s.grandTotalDevBps, coverage: s.coverage })
    .toEqual(snapshot);
});

it("is consistent with the acceptance-test headline (soft)", () => {
  const s = scoreQuote({ pricedRows: pricedRows as any, goldenLines: goldenLines as any });
  expect(s.medianAbsBps == null || s.medianAbsBps < 500).toBe(true);  // "median < 5%"
});
```

- [ ] **Step 3: Generate the fixtures + run**

Dump `alsafi-golden-lines.json` (from `getGoldenLines`) and `alsafi-snapshot.json` (from `scoreQuote` on the two fixtures) once, commit, then:

Run: `npx vitest run tests/backtest/alsafi-snapshot.test.ts`
Expected: PASS (bps-exact equality against the committed snapshot).

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/alsafi-*.json tests/backtest/alsafi-snapshot.test.ts scripts/backtest.ts
git commit -m "test(backtest): AlSafi bps-exact snapshot regression"
```

---

### Task 15: Wire the gate into skill activation

**Files:**
- Modify: `src/lib/db/skills.ts` (`activateSkillVersion` — add an optional pre-activation gate hook) OR document the gate as a manual `--compare` step if activation is CLI-only.
- Test: `tests/backtest/gate.test.ts` (unit: the gate verdict function)

**Interfaces:**
- Consumes: two `ScoreSummary` objects (baseline vs candidate).
- Produces: `gateVerdict(baseline: ScoreSummary, candidate: ScoreSummary): { pass: boolean; reason: string }` — the rule from §8: candidate passes iff it does not regress grand-total deviation or median on any segment and improves at least one.

- [ ] **Step 1: Write the failing test**

```ts
// tests/backtest/gate.test.ts
import { describe, it, expect } from "vitest";
import { gateVerdict } from "@/lib/backtest/gate";

const base = { within5: 40, within10: 60, within20: 80, medianAbsBps: 1000, meanSignedBps: 300, grandTotalDevBps: 1200, coverage: 90, byTrade: {}, lines: [] };

it("passes when candidate improves median and does not regress grand total", () => {
  const cand = { ...base, medianAbsBps: 700, grandTotalDevBps: 1100 };
  expect(gateVerdict(base as any, cand as any).pass).toBe(true);
});
it("fails when candidate regresses grand-total deviation", () => {
  const cand = { ...base, medianAbsBps: 700, grandTotalDevBps: 1500 };
  expect(gateVerdict(base as any, cand as any).pass).toBe(false);
});
it("fails when nothing improves", () => {
  expect(gateVerdict(base as any, { ...base } as any).pass).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/backtest/gate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `gate.ts`**

```ts
// src/lib/backtest/gate.ts
import type { ScoreSummary } from "./types";
export function gateVerdict(baseline: ScoreSummary, candidate: ScoreSummary): { pass: boolean; reason: string } {
  const bMed = baseline.medianAbsBps ?? Infinity, cMed = candidate.medianAbsBps ?? Infinity;
  const bGt = Math.abs(baseline.grandTotalDevBps ?? Infinity), cGt = Math.abs(candidate.grandTotalDevBps ?? Infinity);
  const regressed = cMed > bMed || cGt > bGt;
  const improved = cMed < bMed || cGt < bGt;
  if (regressed) return { pass: false, reason: `regressed: median ${bMed}->${cMed}bps, |grandTotalDev| ${bGt}->${cGt}bps` };
  if (!improved) return { pass: false, reason: "no improvement on any segment" };
  return { pass: true, reason: `improved: median ${bMed}->${cMed}bps, |grandTotalDev| ${bGt}->${cGt}bps` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/backtest/gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Document the gate usage**

Add a short comment block at the top of `scripts/backtest.ts` describing the gate workflow: store a `baseline` run, run a candidate under `--label`, then `--compare baseline <label>`; a new parameter ships only if `gateVerdict` passes on every project-type segment (else it ships type-scoped). Full activation-blocking automation is deferred; the `--compare` output is the gate of record for Phase A.

- [ ] **Step 6: Commit**

```bash
git add src/lib/backtest/gate.ts tests/backtest/gate.test.ts scripts/backtest.ts
git commit -m "feat(backtest): A/B gate verdict + workflow docs"
```

---

## Self-Review (completed against the spec)

- **Spec coverage:** §4 tables → Task 5; §5.1/§5a priced reader → Tasks 2–4; §5.2 trade resolution → Task 12; §6.1 alignment → Task 7; §6.2 runPipeline ext → Task 9; §6.3 metrics → Task 8; §7 CLI → Tasks 12–13; §8 gate → Task 15; §10 AlSafi snapshot → Task 14; §11 registry + profiles → Tasks 10–11. All covered.
- **Type consistency:** `ScoreSummary`/`GoldenLineRow`/`PricedRow` used identically across Tasks 6/8/13/14. `roundHalfAwayFromZero` (Task 1) is the only rounding used in `score.ts`. `parseJDToFils` (existing) converts `PricedRow.rateJD` strings to fils in Task 8 — consistent with the "rateJD is a JD string" note.
- **Cross-phase:** `runPipeline`'s new `overrides` param (Task 9) is what Phase B threads its transforms through; `golden_cases.project_id` is present (Task 5) for Phase D's outturn bridge.
- **No placeholders:** every code step shows real code; the two AI-dependent build steps (golden-build, baseline run) are explicitly one-time and their outputs are frozen into committed fixtures so tests stay deterministic.
