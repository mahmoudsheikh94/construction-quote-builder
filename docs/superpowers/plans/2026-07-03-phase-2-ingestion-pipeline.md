# Phase 2: AI Adapter + Ingestion + Matching Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A headless CLI that takes a real unpriced BOQ (PDF or Excel), extracts + tags + classifies + matches every line item, prices it through Phase 1's `priceQuote`, and emits a priced BOQ (JSON + spreadsheet) with flags — so a real tender can be priced and scored against a human.

**Architecture:** An `AIAdapter` interface (one implementation: shell out to `claude -p --output-format json`) isolates all LLM calls. Ingestion (Excel via SheetJS; PDF via chunked Claude-vision) produces `RawLine[]`. A tagger extracts structured attributes per line (persisted to a corpus for future determinism); a matcher resolves each unit-rate line to a trade cost model (deterministic corpus lookup first, LLM semantic fallback second). The pipeline assembles `MatchedItem[]` and calls Phase 1's `priceQuote`. Minimal seeding (AI-drafted cost models + price book, human-reviewed) makes real pricing possible.

**Tech Stack:** TypeScript strict, Next.js 16 project (CLI via `tsx`), Supabase local, Zod 4, Vitest, `claude` CLI (v2.1.199, on PATH), SheetJS (`xlsx`), exceljs (export).

## Global Constraints

(Inherited from Phase 1 + master roadmap. Every task obeys these.)

- **Money = integer fils; quantities = integer thousandths.** No floats in money/quantity paths. Phase 1's `money.ts` helpers are the only sanctioned arithmetic.
- **The LLM never does arithmetic.** It extracts, tags, classifies, matches. It returns *structured attributes and adjustment parameters*, never a rate or a total. All pricing is Phase 1 code.
- **Every AI response is Zod-validated** at the adapter boundary, with one retry on schema failure. A failure degrades to a flag (`NEEDS_MANUAL` / `NO_MATCH` / `QTY_CHECKSUM_FAIL`), never a silent error or a thrown exception out of the pipeline.
- **AIAdapter is the ONLY module that knows an LLM/CLI is involved.** Nothing else imports child_process or references `claude`. Swapping to the Anthropic API later touches only `claude-cli.ts`.
- **Arabic-first:** every user-facing flag carries `messageAr`. Extraction preserves original-language descriptions verbatim.
- **New DB tables follow the established pattern:** RLS enabled, zero policies, and the `grant all on <tables> to postgres, anon, authenticated, service_role;` line (local `db reset` runs as `postgres`; API roles need the explicit grant). Money columns `bigint`, quantities `bigint`.
- **Reserved flag `PRICE_UNIT_MISMATCH`** (added in Phase 1) is implemented in this phase (Task 9): a price-book entry's unit disagreeing with a cost-model component's assumed unit must flag, not silently mis-price.
- TDD per task; commit after every task. Local Supabase must be running (`supabase status`); if DB tests time out, the Postgres container went unhealthy — recover via stop + force-rm containers + `docker network rm` + `supabase start` + `db reset`.

**Cost note (verified against the live CLI):** `claude -p ... --output-format json` returns an envelope with a top-level `result` string (confirmed) and bills real API cost — a trivial call read ~14k input + ~22k cache-creation tokens (~$0.29) on `claude-opus-4-8`. A full BOQ run (chunked extraction + tag + match per line, 100+ items) can cost several dollars to tens of dollars. Fine for validation; a real cost lever for later. To reduce: the corpus deterministic fast-path (Task 7) eliminates repeat tag/match LLM calls over time, and batching lines per AI call (vs. one call per line in Task 12's loop) is a straightforward Phase-2.1 optimization — noted, not silently ignored. The per-line loop is kept in v1 for clarity and per-line error isolation.

## Phase 1 Interfaces This Phase Consumes (verbatim, do not redefine)

```ts
// src/lib/domain/price-quote.ts
interface MatchedItem {
  id: string; sectionRef: string; itemType: ItemType;
  unitCanonical: CanonicalUnit | null; quantityThousandths: number | null;
  givenAmountFils?: number;
  match: { trade: string; costModelId: string; method: "deterministic" | "semantic"; confidence: number } | null;
}
function priceQuote(input: {
  items: MatchedItem[];
  skills: Record<string, { content: SkillContent; versionId: string }>;
  snapshot: PriceSnapshot;
  overrides?: ProjectOverrides;
  ratioChecks?: ProfileContent["ratioChecks"];
}): { lines: PricedLine[]; rollup: QuoteRollup; projectFlags: Flag[] };

// src/lib/domain/types.ts
type ItemType = "unit_rate" | "provisional_sum" | "dayworks" | "lump_sum" | "percentage";
type CanonicalUnit = "m3"|"m2"|"lm"|"ton"|"nr"|"ls"|"day"|"night"|"pc"|"hr"|"kg"|"pct";

// src/lib/domain/normalize.ts
function normalizeUnit(raw: string): CanonicalUnit | null;
function parseQuantityToThousandths(s: string): number; // throws on invalid

// src/lib/db/skills.ts       getActiveSkill(slug) -> { content: SkillContent; versionId; versionNumber } | null
// src/lib/db/price-book.ts   getSnapshot(asOf?) -> PriceSnapshot ; addPriceEntry({key,labelAr,unit,priceFils,effectiveDate?})
// src/lib/domain/skill-schema.ts   CostModel { id; labelAr; unit; keywords: string[]; components; wastePct; markupPct; band? }
```

## File Map (target state)

```
src/lib/
  ai/
    adapter.ts        # AIAdapter interface, runAI(), Zod-validate + 1 retry, error taxonomy
    claude-cli.ts     # the only impl: shells `claude -p ... --output-format json`
  ingest/
    types.ts          # RawLine, ExtractionResult
    arabic-words.ts   # arabicCardinalToInt() — deterministic, for dual-notation checksum
    excel.ts          # SheetJS -> RawLine[]
    pdf.ts            # pdf page-count + page-range chunking; per-chunk vision extraction via AIAdapter
    item-type-gate.ts # RawLine -> ItemType (rules-first, LLM assist fallback)
  pipeline/
    tag.ts            # per-line structured tags via AIAdapter; persist to corpus
    match.ts          # deterministic corpus lookup -> semantic fallback -> { trade, costModelId, method, confidence } | null
    assemble.ts       # RawLine + tags + match -> MatchedItem[]; wire to priceQuote
    run.ts            # CLI entry: file -> priced JSON + flags
  db/
    corpus.ts         # line_item_tags + match_corpus repos
  export/
    priced-boq.ts     # priceQuote output -> Excel (exceljs, RTL) + JSON
  seed/
    seed-from-priced.ts # AI-draft cost models + price book for a trade set; human-review gate
supabase/migrations/  # + corpus tables
scripts/
  pipeline.ts         # npm run pipeline -- --file <boq> --type <profile> [--seed]
```

---

### Task 1: AIAdapter Interface + Claude CLI Implementation

**Files:**
- Create: `src/lib/ai/adapter.ts`, `src/lib/ai/claude-cli.ts`
- Test: `tests/ai/adapter.test.ts`

**Interfaces:**
- Consumes: nothing (Phase 1 independent)
- Produces:
  - `class AIUnavailableError extends Error` ; `class AISchemaError extends Error { attempts: number }`
  - `interface AIRequest { system?: string; prompt: string; files?: string[]; schema: z.ZodTypeAny; maxRetries?: number }`
  - `interface AIAdapter { run<T>(req: AIRequest): Promise<T> }`
  - `function claudeCliAdapter(opts?: { bin?: string; timeoutMs?: number }): AIAdapter`
  - `function extractJson(raw: string): unknown` — pulls the JSON object from `claude`'s stdout (handles fenced blocks / preamble)

- [ ] **Step 1: Write the failing test** (adapter validation + retry logic, with a FAKE runner injected so no real CLI call)

`tests/ai/adapter.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { makeAdapter, extractJson, AISchemaError } from "@/lib/ai/adapter";

const schema = z.object({ items: z.array(z.object({ n: z.number() })) });

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("parses JSON inside a fenced code block with preamble", () => {
    expect(extractJson('Sure!\n```json\n{"a":2}\n```\n')).toEqual({ a: 2 });
  });
});

describe("makeAdapter (with injected runner)", () => {
  it("returns validated data on first success", async () => {
    const adapter = makeAdapter(async () => '{"items":[{"n":1}]}');
    const out = await adapter.run({ prompt: "x", schema });
    expect(out).toEqual({ items: [{ n: 1 }] });
  });

  it("retries once on schema mismatch, then succeeds", async () => {
    let calls = 0;
    const adapter = makeAdapter(async () => {
      calls++;
      return calls === 1 ? '{"items":[{"n":"bad"}]}' : '{"items":[{"n":2}]}';
    });
    const out = await adapter.run({ prompt: "x", schema });
    expect(out).toEqual({ items: [{ n: 2 }] });
    expect(calls).toBe(2);
  });

  it("throws AISchemaError after retries are exhausted", async () => {
    const adapter = makeAdapter(async () => '{"items":[{"n":"bad"}]}');
    await expect(adapter.run({ prompt: "x", schema, maxRetries: 1 })).rejects.toBeInstanceOf(AISchemaError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ai/adapter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/lib/ai/adapter.ts`**

```ts
import { z } from "zod";

export class AIUnavailableError extends Error {}
export class AISchemaError extends Error {
  constructor(message: string, public attempts: number) { super(message); }
}

export interface AIRequest {
  system?: string;
  prompt: string;
  files?: string[];
  schema: z.ZodTypeAny;
  maxRetries?: number;
}

export interface AIAdapter { run<T>(req: AIRequest): Promise<T>; }

// A Runner is the raw text-in/text-out boundary. claude-cli.ts provides the real one;
// tests inject a fake. This is what keeps child_process out of everything but claude-cli.ts.
export type Runner = (req: AIRequest) => Promise<string>;

export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const startArr = candidate.indexOf("[");
  const from = start === -1 ? startArr : startArr === -1 ? start : Math.min(start, startArr);
  if (from === -1) throw new Error("لا يوجد JSON في مخرجات الذكاء الاصطناعي");
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  return JSON.parse(candidate.slice(from, end + 1));
}

export function makeAdapter(runner: Runner): AIAdapter {
  return {
    async run<T>(req: AIRequest): Promise<T> {
      const maxRetries = req.maxRetries ?? 1;
      let lastErr: unknown;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const raw = await runner(req);
        try {
          return req.schema.parse(extractJson(raw)) as T;
        } catch (e) {
          lastErr = e;
        }
      }
      throw new AISchemaError(
        `فشل التحقق من مخرجات الذكاء الاصطناعي بعد ${maxRetries + 1} محاولات: ${String(lastErr)}`,
        maxRetries + 1,
      );
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ai/adapter.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Implement the real CLI runner `src/lib/ai/claude-cli.ts`** (no test — it shells the real binary; it's exercised in the Task 5 live smoke)

```ts
import { spawn } from "node:child_process";
import { makeAdapter, AIUnavailableError, type AIAdapter, type AIRequest } from "./adapter";

export function claudeCliAdapter(opts?: { bin?: string; timeoutMs?: number }): AIAdapter {
  const bin = opts?.bin ?? "claude";
  const timeoutMs = opts?.timeoutMs ?? 180_000;
  return makeAdapter((req: AIRequest) => runClaude(bin, timeoutMs, req));
}

function runClaude(bin: string, timeoutMs: number, req: AIRequest): Promise<string> {
  // Build the prompt: system + task + any file references. `claude -p` reads the prompt
  // as a positional arg; files are referenced by absolute path in the prompt text and
  // passed via --add-dir so the CLI can read them. --output-format json wraps the result.
  const parts: string[] = [];
  if (req.system) parts.push(req.system, "\n\n");
  parts.push(req.prompt);
  if (req.files?.length) {
    parts.push("\n\nالملفات المرفقة (اقرأها بالكامل):\n", req.files.map((f) => `- ${f}`).join("\n"));
  }
  const args = ["-p", parts.join(""), "--output-format", "json"];
  for (const f of req.files ?? []) args.push("--add-dir", dirOf(f));

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new AIUnavailableError("انتهت مهلة استدعاء claude")); }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { clearTimeout(timer); reject(new AIUnavailableError(`تعذّر تشغيل claude: ${e.message}`)); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new AIUnavailableError(`claude خرج برمز ${code}: ${err.slice(0, 500)}`));
      // `claude --output-format json` returns an envelope { result: "...", ... }.
      // Return the inner result text; the adapter's extractJson digs the payload out of it.
      try {
        const env = JSON.parse(out);
        resolve(typeof env.result === "string" ? env.result : out);
      } catch { resolve(out); }
    });
  });
}

function dirOf(p: string): string { return p.replace(/\/[^/]*$/, "") || "/"; }
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai tests/ai
git commit -m "feat: AIAdapter interface + claude CLI runner (zod-validated, retry, isolated)"
```

---

### Task 2: Arabic Number-Words Parser (dual-notation checksum)

**Files:**
- Create: `src/lib/ingest/arabic-words.ts`
- Test: `tests/ingest/arabic-words.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `function arabicCardinalToInt(words: string): number | null` — `"ثمانية عشر ألف"` → `18000`; returns `null` when it can't parse (checksum simply skipped, never a crash). Finite Arabic cardinal vocabulary; NO LLM.

- [ ] **Step 1: Write the failing test**

`tests/ingest/arabic-words.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { arabicCardinalToInt } from "@/lib/ingest/arabic-words";

describe("arabicCardinalToInt", () => {
  it("parses units, teens, tens", () => {
    expect(arabicCardinalToInt("ثلاثة")).toBe(3);
    expect(arabicCardinalToInt("ثمانية عشر")).toBe(18);
    expect(arabicCardinalToInt("واحد وستون")).toBe(61);   // 61 (one and sixty)
    expect(arabicCardinalToInt("ثلاثة وتسعون")).toBe(93);
  });
  it("parses hundreds and thousands", () => {
    expect(arabicCardinalToInt("ألفان وسبعمائة")).toBe(2700);
    expect(arabicCardinalToInt("ثمانية عشر ألف")).toBe(18000);
    expect(arabicCardinalToInt("ألف ومئتان")).toBe(1200);
  });
  it("returns null for unparseable input", () => {
    expect(arabicCardinalToInt("")).toBeNull();
    expect(arabicCardinalToInt("سيارة زرقاء")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ingest/arabic-words.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/lib/ingest/arabic-words.ts`**

```ts
// Deterministic Levantine/MSA cardinal parser for BOQ quantity-in-words.
// Handles the forms seen in real Jordanian BOQs: units, teens, tens (with "و" and-joins),
// hundreds (مئة/مائة + compounds like سبعمائة), and thousands (ألف/ألفان/آلاف).
const UNITS: Record<string, number> = {
  "صفر": 0, "واحد": 1, "واحدة": 1, "اثنان": 2, "اثنين": 2, "ثلاثة": 3, "أربعة": 4, "اربعة": 4,
  "خمسة": 5, "ستة": 6, "سبعة": 7, "ثمانية": 8, "تسعة": 9,
};
const TEN = 10;
const TEENS: Record<string, number> = {
  "عشرة": 10, "أحد عشر": 11, "احد عشر": 11, "اثنا عشر": 12, "اثني عشر": 12, "ثلاثة عشر": 13,
  "أربعة عشر": 14, "اربعة عشر": 14, "خمسة عشر": 15, "ستة عشر": 16, "سبعة عشر": 17,
  "ثمانية عشر": 18, "تسعة عشر": 19,
};
const TENS: Record<string, number> = {
  "عشرون": 20, "عشرين": 20, "ثلاثون": 30, "ثلاثين": 30, "أربعون": 40, "اربعون": 40, "اربعين": 40,
  "خمسون": 50, "خمسين": 50, "ستون": 60, "ستين": 60, "سبعون": 70, "سبعين": 70,
  "ثمانون": 80, "ثمانين": 80, "تسعون": 90, "تسعين": 90,
};
const HUNDREDS: Record<string, number> = {
  "مئة": 100, "مائة": 100, "مئتان": 200, "مئتين": 200, "مائتان": 200, "مائتين": 200,
  "ثلاثمائة": 300, "ثلاثمئة": 300, "أربعمائة": 400, "اربعمائة": 400, "خمسمائة": 500, "خمسمئة": 500,
  "ستمائة": 600, "ستمئة": 600, "سبعمائة": 700, "سبعمئة": 700, "ثمانمائة": 800, "ثمانمئة": 800,
  "تسعمائة": 900, "تسعمئة": 900,
};
const THOUSAND_WORDS = new Set(["ألف", "الف", "آلاف", "الاف"]);
const TWO_THOUSAND = new Set(["ألفان", "الفان", "ألفين", "الفين"]);

export function arabicCardinalToInt(words: string): number | null {
  if (!words || !words.trim()) return null;
  const toks = words.replace(/[،,]/g, " ").split(/\s+|و(?=[ا-ي])/).map((t) => t.replace(/^و/, "").trim()).filter(Boolean);
  if (toks.length === 0) return null;

  let total = 0, current = 0, matchedAny = false, i = 0;
  const consumeTeen = (a: string, b?: string): number | null => {
    if (b && TEENS[`${a} ${b}`] !== undefined) return TEENS[`${a} ${b}`];
    return null;
  };

  while (i < toks.length) {
    const t = toks[i], t2 = toks[i + 1];
    const teen = consumeTeen(t, t2);
    if (teen !== null) { current += teen; matchedAny = true; i += 2; continue; }
    if (TWO_THOUSAND.has(t)) { total += (current || 1) * 0 + 2000; current = 0; matchedAny = true; i++; continue; }
    if (THOUSAND_WORDS.has(t)) { total += (current || 1) * 1000; current = 0; matchedAny = true; i++; continue; }
    if (HUNDREDS[t] !== undefined) { current += HUNDREDS[t]; matchedAny = true; i++; continue; }
    if (TENS[t] !== undefined) { current += TENS[t]; matchedAny = true; i++; continue; }
    if (TEENS[t] !== undefined) { current += TEENS[t]; matchedAny = true; i++; continue; }
    if (UNITS[t] !== undefined) { current += UNITS[t]; matchedAny = true; i++; continue; }
    i++; // skip filler/unknown token
  }
  if (!matchedAny) return null;
  return total + current;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ingest/arabic-words.test.ts`
Expected: PASS. If a specific compound (e.g. `ألفان وسبعمائة`) is off, fix the parser logic — never the test. The and-join split and the two-thousand handling are the fiddly parts.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/arabic-words.ts tests/ingest/arabic-words.test.ts
git commit -m "feat: deterministic Arabic cardinal parser for dual-notation checksum"
```

---

### Task 3: Ingest Types + Excel Ingestion

**Files:**
- Create: `src/lib/ingest/types.ts`, `src/lib/ingest/excel.ts`
- Test: `tests/ingest/excel.test.ts`, `tests/fixtures/mini-boq.xlsx` (created in-test with SheetJS)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface RawLine { sortOrder: number; itemCode?: string; sectionRef: string; descriptionOriginal: string; unitRaw?: string; quantityRaw?: string; quantityWords?: string }`
  - `interface ExtractionResult { lines: RawLine[]; warnings: string[] }`
  - `function ingestExcel(path: string, opts?: { sheet?: string }): ExtractionResult`

- [ ] **Step 1: Add the `xlsx` dependency**

Run: `npm install xlsx`

- [ ] **Step 2: Write the failing test** (build a tiny xlsx in-test, then ingest it)

`tests/ingest/excel.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import * as XLSX from "xlsx";
import { writeFileSync, mkdirSync } from "node:fs";
import { ingestExcel } from "@/lib/ingest/excel";

const fixture = "tests/fixtures/mini-boq.xlsx";

beforeAll(() => {
  mkdirSync("tests/fixtures", { recursive: true });
  const rows = [
    ["الرقم", "وصف البند", "الوحدة", "الكمية"],
    ["1/1", "حفريات للأساسات", "م3", "18000"],
    ["2/1", "خرسانة عادية درجة 18", "م3", "93"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BOQ");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  writeFileSync(fixture, buf);
});

describe("ingestExcel", () => {
  it("maps rows to RawLine[] with header detection", () => {
    const { lines } = ingestExcel(fixture);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ itemCode: "1/1", descriptionOriginal: "حفريات للأساسات", unitRaw: "م3", quantityRaw: "18000", sortOrder: 0 });
    expect(lines[1].descriptionOriginal).toContain("خرسانة");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/ingest/excel.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement `src/lib/ingest/types.ts` and `src/lib/ingest/excel.ts`**

`src/lib/ingest/types.ts`:
```ts
export interface RawLine {
  sortOrder: number;
  itemCode?: string;
  sectionRef: string;
  descriptionOriginal: string;
  unitRaw?: string;
  quantityRaw?: string;
  quantityWords?: string;
}
export interface ExtractionResult { lines: RawLine[]; warnings: string[]; }
```

`src/lib/ingest/excel.ts`:
```ts
import * as XLSX from "xlsx";
import type { ExtractionResult, RawLine } from "./types";

// Header synonyms across the two BOQ dialects (Arabic-native + English CSI).
const COL = {
  code: ["الرقم", "رقم", "item", "item no", "no", "code"],
  desc: ["وصف البند", "نوع العمل", "الوصف", "description", "particulars"],
  unit: ["الوحدة", "وحدة القياس", "unit", "uom"],
  qty: ["الكمية", "quantity", "qty"],
};

function findCol(header: string[], names: string[]): number {
  const norm = header.map((h) => String(h ?? "").trim().toLowerCase());
  for (const n of names) { const i = norm.indexOf(n.toLowerCase()); if (i !== -1) return i; }
  return -1;
}

export function ingestExcel(path: string, opts?: { sheet?: string }): ExtractionResult {
  const wb = XLSX.readFile(path);
  const sheetName = opts?.sheet ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, raw: false });
  const warnings: string[] = [];
  if (rows.length < 2) return { lines: [], warnings: ["الورقة فارغة أو لا تحتوي بيانات"] };

  const header = rows[0].map((c) => String(c ?? ""));
  const cCode = findCol(header, COL.code), cDesc = findCol(header, COL.desc);
  const cUnit = findCol(header, COL.unit), cQty = findCol(header, COL.qty);
  if (cDesc === -1) warnings.push("تعذّر تحديد عمود الوصف — سيُستخدم العمود الثاني");

  const lines: RawLine[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const desc = String(row[cDesc === -1 ? 1 : cDesc] ?? "").trim();
    if (!desc) continue; // skip blank/section-separator rows
    lines.push({
      sortOrder: lines.length,
      itemCode: cCode !== -1 ? String(row[cCode] ?? "").trim() || undefined : undefined,
      sectionRef: sectionOf(cCode !== -1 ? String(row[cCode] ?? "") : ""),
      descriptionOriginal: desc,
      unitRaw: cUnit !== -1 ? String(row[cUnit] ?? "").trim() || undefined : undefined,
      quantityRaw: cQty !== -1 ? String(row[cQty] ?? "").trim() || undefined : undefined,
    });
  }
  return { lines, warnings };
}

// Section = the part of the item code before the first "/" (e.g. "2/1" -> "2"); else "0".
function sectionOf(code: string): string {
  const m = code.trim().match(/^([^/.\s]+)/);
  return m ? m[1] : "0";
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/ingest/excel.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/types.ts src/lib/ingest/excel.ts tests/ingest/excel.test.ts package.json package-lock.json
git commit -m "feat: Excel BOQ ingestion (dual-dialect header detection) + RawLine types"
```

---

### Task 4: PDF Page-Range Chunking + Vision Extraction

**Files:**
- Create: `src/lib/ingest/pdf.ts`
- Test: `tests/ingest/pdf.test.ts`

**Interfaces:**
- Consumes: `AIAdapter` (Task 1), `RawLine`/`ExtractionResult` (Task 3), `arabicCardinalToInt` (Task 2), `parseQuantityToThousandths` (Phase 1)
- Produces:
  - `function pageRanges(pageCount: number, chunkSize: number): Array<[number, number]>` — pure, testable chunk boundaries
  - `const RAW_LINES_SCHEMA` — Zod schema for the AI extraction response
  - `async function ingestPdf(path: string, adapter: AIAdapter, opts?: { chunkSize?: number }): Promise<ExtractionResult>` — chunks, extracts each chunk via adapter, stitches, runs the dual-notation checksum, appends `QTY_CHECKSUM_FAIL`-style warnings

The pure `pageRanges` is unit-tested; the vision extraction is exercised against a real PDF in Task 5's live smoke (no mocked-vision unit test — that would test nothing real).

- [ ] **Step 1: Add pdf page-count dependency**

Run: `npm install pdfjs-dist`
(Used only to read the page count; extraction itself is Claude vision on the file.)

- [ ] **Step 2: Write the failing test** (pure chunking + checksum logic; extraction via an injected fake adapter returning canned lines)

`tests/ingest/pdf.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { pageRanges, checksumWarnings } from "@/lib/ingest/pdf";
import type { RawLine } from "@/lib/ingest/types";

describe("pageRanges", () => {
  it("splits pages into inclusive 1-based chunks", () => {
    expect(pageRanges(10, 4)).toEqual([[1, 4], [5, 8], [9, 10]]);
    expect(pageRanges(3, 4)).toEqual([[1, 3]]);
    expect(pageRanges(0, 4)).toEqual([]);
  });
});

describe("checksumWarnings", () => {
  it("flags a line whose numeric qty disagrees with its words", () => {
    const lines: RawLine[] = [
      { sortOrder: 0, sectionRef: "1", descriptionOriginal: "حفر", quantityRaw: "18000", quantityWords: "ثمانية عشر ألف" }, // agrees
      { sortOrder: 1, sectionRef: "1", descriptionOriginal: "خرسانة", quantityRaw: "93", quantityWords: "ثلاثة وتسعون" },   // agrees
      { sortOrder: 2, sectionRef: "1", descriptionOriginal: "حديد", quantityRaw: "61", quantityWords: "خمسون" },            // 61 vs 50 -> mismatch
    ];
    const warns = checksumWarnings(lines);
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain("2"); // references the offending sortOrder/line
  });
  it("skips lines with no words (checksum simply unavailable)", () => {
    expect(checksumWarnings([{ sortOrder: 0, sectionRef: "1", descriptionOriginal: "x", quantityRaw: "5" }])).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/ingest/pdf.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement `src/lib/ingest/pdf.ts`**

```ts
import { z } from "zod";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { AIAdapter } from "@/lib/ai/adapter";
import type { ExtractionResult, RawLine } from "./types";
import { arabicCardinalToInt } from "./arabic-words";

export function pageRanges(pageCount: number, chunkSize: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let start = 1; start <= pageCount; start += chunkSize) {
    ranges.push([start, Math.min(start + chunkSize - 1, pageCount)]);
  }
  return ranges;
}

const RawLineSchema = z.object({
  itemCode: z.string().optional(),
  sectionRef: z.string(),
  descriptionOriginal: z.string(),
  unitRaw: z.string().optional(),
  quantityRaw: z.string().optional(),
  quantityWords: z.string().optional(),
});
export const RAW_LINES_SCHEMA = z.object({ lines: z.array(RawLineSchema) });

export function checksumWarnings(lines: RawLine[]): string[] {
  const warnings: string[] = [];
  for (const line of lines) {
    if (!line.quantityWords || !line.quantityRaw) continue;
    const fromWords = arabicCardinalToInt(line.quantityWords);
    if (fromWords === null) continue;
    const numeric = Number(String(line.quantityRaw).replace(/[,٬\s]/g, ""));
    if (!Number.isFinite(numeric)) continue;
    if (Math.round(numeric) !== fromWords) {
      warnings.push(`تعارض في الكمية للبند ${line.sortOrder} (${line.itemCode ?? ""}): رقم=${numeric} كتابة=${fromWords}`);
    }
  }
  return warnings;
}

async function pageCount(path: string): Promise<number> {
  const doc = await getDocument({ url: path }).promise;
  return doc.numPages;
}

const EXTRACT_SYSTEM = `أنت مستخرج بنود جداول كميات إنشائية (BOQ). استخرج كل بند سطراً سطراً من الصفحات المرفقة.
لكل بند أعِد: itemCode (رقم البند مثل 2/1)، sectionRef (الجزء قبل / من رقم البند)، descriptionOriginal (الوصف كما هو حرفياً بلغته الأصلية)، unitRaw (الوحدة كما كُتبت: م3، م2، عدد...)، quantityRaw (الكمية بالأرقام)، quantityWords (الكمية بالحروف إن وُجدت).
لا تحسب أي أسعار. لا تخترع بنوداً. أعِد JSON فقط بالشكل: {"lines":[...]}. حافظ على الترتيب.`;

export async function ingestPdf(path: string, adapter: AIAdapter, opts?: { chunkSize?: number }): Promise<ExtractionResult> {
  const chunkSize = opts?.chunkSize ?? 6;
  const pages = await pageCount(path);
  const ranges = pageRanges(pages, chunkSize);
  const all: RawLine[] = [];
  const warnings: string[] = [];

  for (const [from, to] of ranges) {
    try {
      const res = await adapter.run<{ lines: Array<Omit<RawLine, "sortOrder">> }>({
        system: EXTRACT_SYSTEM,
        prompt: `استخرج البنود من الصفحات ${from} إلى ${to} من ملف جدول الكميات.`,
        files: [path],
        schema: RAW_LINES_SCHEMA,
      });
      for (const l of res.lines) all.push({ ...l, sortOrder: all.length });
    } catch (e) {
      warnings.push(`فشل استخراج الصفحات ${from}-${to}: ${String(e)}`);
    }
  }
  warnings.push(...checksumWarnings(all));
  return { lines: all, warnings };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/ingest/pdf.test.ts`
Expected: PASS (pure functions). Vision extraction is validated live in Task 5.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/pdf.ts tests/ingest/pdf.test.ts package.json package-lock.json
git commit -m "feat: PDF page-range chunking + vision extraction + dual-notation checksum"
```

---

### Task 5: Live Extraction Smoke (real claude CLI, real BOQ)

**Files:**
- Create: `scripts/smoke-extract.ts`
- Test: (manual/live — not part of `npm test`; it calls the real CLI)

**Interfaces:**
- Consumes: `claudeCliAdapter` (Task 1), `ingestPdf` (Task 4), `ingestExcel` (Task 3)
- Produces: a script that extracts a real reference BOQ and prints the line count + first 5 lines, proving the CLI adapter + vision path actually work end-to-end before more is built on them.

- [ ] **Step 1: Write `scripts/smoke-extract.ts`**

```ts
import { claudeCliAdapter } from "@/lib/ai/adapter"; // re-exported from claude-cli via index if needed
import { claudeCliAdapter as cli } from "@/lib/ai/claude-cli";
import { ingestPdf } from "@/lib/ingest/pdf";

async function main() {
  const path = process.argv[2] ?? "reference-docs/جدول الكميات بدون اسعار.pdf";
  const adapter = cli({ timeoutMs: 240_000 });
  const { lines, warnings } = await ingestPdf(path, adapter, { chunkSize: 4 });
  console.log(`استُخرج ${lines.length} بنداً من ${path}`);
  console.log(JSON.stringify(lines.slice(0, 5), null, 2));
  if (warnings.length) console.log("تحذيرات:", warnings.slice(0, 10));
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the live smoke against a real reference BOQ**

Run: `npx tsx scripts/smoke-extract.ts "reference-docs/جدول الكميات بدون اسعار.pdf"`
Expected: prints a plausible line count (dozens+) and 5 structured Arabic line items with itemCode/unit/quantity populated. This proves the real `claude` CLI adapter and vision extraction work.

**If it fails:** the failure is environmental/CLI-shape, not logic — capture the exact error. Common issues: `claude -p` prompt too large (reduce chunkSize), `--add-dir` path handling, or the `--output-format json` envelope shape differing from Task 1's assumption (adjust `runClaude`'s envelope parsing). Report findings; do not fake the extraction.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke-extract.ts
git commit -m "chore: live extraction smoke script (real claude CLI + real BOQ)"
```

---

### Task 6: Item-Type Gate

**Files:**
- Create: `src/lib/ingest/item-type-gate.ts`
- Test: `tests/ingest/item-type-gate.test.ts`

**Interfaces:**
- Consumes: `RawLine` (Task 3), `ItemType` (Phase 1)
- Produces: `function classifyItemType(line: RawLine): { itemType: ItemType; confident: boolean }` — rules-first (keyword/structure); `confident: false` signals the pipeline may optionally ask the LLM (Task 8 handles that). P.S./dayworks/percentage/lump-sum never reach rate matching downstream.

- [ ] **Step 1: Write the failing test**

`tests/ingest/item-type-gate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { classifyItemType } from "@/lib/ingest/item-type-gate";

const line = (over: Partial<Parameters<typeof classifyItemType>[0]>) =>
  ({ sortOrder: 0, sectionRef: "x", descriptionOriginal: "", ...over } as any);

describe("classifyItemType", () => {
  it("detects provisional sums", () => {
    expect(classifyItemType(line({ descriptionOriginal: "مبلغ احتياطي لنقل الخدمات", unitRaw: "مقطوع" })).itemType).toBe("provisional_sum");
    expect(classifyItemType(line({ descriptionOriginal: "Provisional Sum for utility relocation" })).itemType).toBe("provisional_sum");
  });
  it("detects dayworks", () => {
    expect(classifyItemType(line({ descriptionOriginal: "أعمال باليومية", unitRaw: "يوم" })).itemType).toBe("dayworks");
    expect(classifyItemType(line({ descriptionOriginal: "Dayworks - skilled labour", unitRaw: "hr" })).itemType).toBe("dayworks");
  });
  it("detects percentage lines", () => {
    expect(classifyItemType(line({ descriptionOriginal: "Overhead and Profit", unitRaw: "%" })).itemType).toBe("percentage");
  });
  it("detects lump sum", () => {
    expect(classifyItemType(line({ descriptionOriginal: "تجهيز الموقع", unitRaw: "مقطوع" })).itemType).toBe("lump_sum");
  });
  it("defaults to unit_rate for ordinary measured items", () => {
    const r = classifyItemType(line({ descriptionOriginal: "خرسانة عادية درجة 18", unitRaw: "م3" }));
    expect(r.itemType).toBe("unit_rate");
    expect(r.confident).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ingest/item-type-gate.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/lib/ingest/item-type-gate.ts`**

```ts
import type { RawLine } from "./types";
import type { ItemType } from "@/lib/domain/types";
import { normalizeUnit } from "@/lib/domain/normalize";

const PS = [/provisional\s+sum/i, /\bp\.?\s?s\.?\b/i, /مبلغ\s+احتياطي/, /احتياطي/, /مخصص/];
const DAYWORK = [/dayworks?/i, /باليومية|أعمال\s+يومية|عمل\s+باليوم/];
const PCT = [/overhead\s+and\s+profit/i, /نسبة|أرباح\s+ومصاريف/];

export function classifyItemType(line: RawLine): { itemType: ItemType; confident: boolean } {
  const d = line.descriptionOriginal ?? "";
  const unit = line.unitRaw ? normalizeUnit(line.unitRaw) : null;

  if (unit === "pct" || PCT.some((re) => re.test(d))) return { itemType: "percentage", confident: true };
  if (PS.some((re) => re.test(d))) return { itemType: "provisional_sum", confident: true };
  if (DAYWORK.some((re) => re.test(d)) || unit === "day" || unit === "night") return { itemType: "dayworks", confident: true };
  // lump sum: explicitly "مقطوع"/"L.S" AND not already caught as a provisional sum
  if (unit === "ls") return { itemType: "lump_sum", confident: true };

  // A measurable unit (m2/m3/lm/ton/nr/kg) with a normal description → unit_rate, confident.
  if (unit && ["m2", "m3", "lm", "ton", "nr", "kg", "pc"].includes(unit)) return { itemType: "unit_rate", confident: true };
  return { itemType: "unit_rate", confident: false }; // unknown unit → let the pipeline decide/flag
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ingest/item-type-gate.test.ts`
Expected: PASS. If "تجهيز الموقع / مقطوع" resolves to provisional_sum instead of lump_sum, tighten the PS regexes (they must not match a bare site-setup lump sum) — fix the rules, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/item-type-gate.ts tests/ingest/item-type-gate.test.ts
git commit -m "feat: item-type gate (provisional sum / dayworks / percentage / lump sum / unit rate)"
```

---

### Task 7: Corpus Tables + Repository

**Files:**
- Create: `supabase/migrations/<ts>_corpus.sql`, `src/lib/db/corpus.ts`
- Test: `tests/db/corpus.test.ts`

**Interfaces:**
- Consumes: `serviceClient` (Phase 1)
- Produces:
  - `interface LineTags { material?: string; dimensions?: string; grade?: string; category?: string; standardRefs?: string[] }`
  - `function tagSignature(trade: string, tags: LineTags): string` — deterministic canonical key for corpus lookup
  - `async function recordTagging(input: { trade: string; rawText: string; tags: LineTags; costModelId?: string }): Promise<void>`
  - `async function lookupBySignature(trade: string, tags: LineTags): Promise<{ costModelId: string; hitCount: number } | null>`

- [ ] **Step 1: Migration**

Run `npx supabase migration new corpus`, fill:
```sql
create table line_item_tags (
  id uuid primary key default gen_random_uuid(),
  trade text not null,
  raw_text text not null,
  tags jsonb not null,
  signature text not null,
  cost_model_id text,
  created_at timestamptz not null default now()
);
create index line_item_tags_sig on line_item_tags(trade, signature);

-- match_corpus: the deterministic fast-path. One row per (trade, signature) that has
-- resolved to a cost model, with a hit counter so frequent matches are trusted.
create table match_corpus (
  id uuid primary key default gen_random_uuid(),
  trade text not null,
  signature text not null,
  cost_model_id text not null,
  hit_count integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (trade, signature)
);

alter table line_item_tags enable row level security;
alter table match_corpus enable row level security;
grant all on line_item_tags, match_corpus to postgres, anon, authenticated, service_role;
```
Run: `npx supabase db reset`

- [ ] **Step 2: Write the failing test**

`tests/db/corpus.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { tagSignature, recordTagging, lookupBySignature } from "@/lib/db/corpus";

describe("corpus", () => {
  it("builds a stable signature regardless of tag key order", () => {
    const a = tagSignature("tiling", { material: "ceramic", grade: "A", category: "floor" });
    const b = tagSignature("tiling", { category: "floor", grade: "A", material: "ceramic" });
    expect(a).toBe(b);
  });

  it("records a tagging + resolved model, then looks it up by signature", async () => {
    const trade = `tiling_${Date.now()}`;
    const tags = { material: "ceramic", dimensions: "60x60", category: "floor" };
    await recordTagging({ trade, rawText: "بلاط سيراميك 60x60", tags, costModelId: "tiling.ceramic_floor" });
    const hit = await lookupBySignature(trade, tags);
    expect(hit?.costModelId).toBe("tiling.ceramic_floor");
    expect(hit?.hitCount).toBeGreaterThanOrEqual(1);
  });

  it("returns null when no prior match exists for the signature", async () => {
    expect(await lookupBySignature(`novel_${Date.now()}`, { material: "unobtanium" })).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/db/corpus.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement `src/lib/db/corpus.ts`**

```ts
import { serviceClient } from "./client";

export interface LineTags {
  material?: string; dimensions?: string; grade?: string; category?: string; standardRefs?: string[];
}

export function tagSignature(trade: string, tags: LineTags): string {
  const norm = (s?: string) => (s ?? "").trim().toLowerCase();
  const refs = (tags.standardRefs ?? []).map((r) => r.trim().toLowerCase()).sort().join("|");
  // Fixed field order → order-independent, deterministic key.
  return [trade, norm(tags.category), norm(tags.material), norm(tags.dimensions), norm(tags.grade), refs].join("::");
}

export async function recordTagging(input: {
  trade: string; rawText: string; tags: LineTags; costModelId?: string;
}): Promise<void> {
  const sig = tagSignature(input.trade, input.tags);
  const sc = serviceClient();
  const { error: e1 } = await sc.from("line_item_tags").insert({
    trade: input.trade, raw_text: input.rawText, tags: input.tags, signature: sig, cost_model_id: input.costModelId,
  });
  if (e1) throw e1;
  if (input.costModelId) {
    // Upsert the match_corpus fast-path row, bumping hit_count.
    const { data: existing } = await sc.from("match_corpus")
      .select("id, hit_count").eq("trade", input.trade).eq("signature", sig).maybeSingle();
    if (existing) {
      const { error } = await sc.from("match_corpus")
        .update({ hit_count: existing.hit_count + 1, updated_at: new Date().toISOString(), cost_model_id: input.costModelId })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await sc.from("match_corpus")
        .insert({ trade: input.trade, signature: sig, cost_model_id: input.costModelId });
      if (error) throw error;
    }
  }
}

export async function lookupBySignature(trade: string, tags: LineTags): Promise<{ costModelId: string; hitCount: number } | null> {
  const sig = tagSignature(trade, tags);
  const { data, error } = await serviceClient()
    .from("match_corpus").select("cost_model_id, hit_count").eq("trade", trade).eq("signature", sig).maybeSingle();
  if (error) throw error;
  return data ? { costModelId: data.cost_model_id, hitCount: data.hit_count } : null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/db/corpus.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations src/lib/db/corpus.ts tests/db/corpus.test.ts
git commit -m "feat: tagging corpus tables + repo (signature lookup, hit-count fast path)"
```

---

### Task 8: Tagger + Matcher

**Files:**
- Create: `src/lib/pipeline/tag.ts`, `src/lib/pipeline/match.ts`
- Test: `tests/pipeline/tag.test.ts`, `tests/pipeline/match.test.ts`

**Interfaces:**
- Consumes: `AIAdapter` (Task 1), `LineTags`/`tagSignature`/`recordTagging`/`lookupBySignature` (Task 7), `CostModel`/`SkillContent` (Phase 1), `RawLine` (Task 3)
- Produces:
  - `const TAGS_SCHEMA` (Zod) ; `async function tagLine(adapter, trade, line): Promise<LineTags>` (persists via recordTagging)
  - `interface MatchResult { trade: string; costModelId: string; method: "deterministic" | "semantic"; confidence: number }`
  - `async function matchLine(adapter, trade, tags, skill: SkillContent, rawText): Promise<MatchResult | null>` — corpus lookup first (deterministic, confidence 1); else LLM picks the nearest cost model id from `skill.costModels` (semantic, returns null if the LLM declines / none fit)

- [ ] **Step 1: Write the failing test** (both with injected fake adapters + the real corpus DB)

`tests/pipeline/match.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { matchLine } from "@/lib/pipeline/match";
import { recordTagging } from "@/lib/db/corpus";
import { makeAdapter } from "@/lib/ai/adapter";
import type { SkillContent } from "@/lib/domain/skill-schema";

const skill: SkillContent = {
  trade: "tiling",
  costModels: [{
    id: "tiling.ceramic_floor", labelAr: "بلاط سيراميك", unit: "m2", keywords: ["سيراميك", "بلاط"],
    components: [{ id: "t", kind: "material", labelAr: "بلاط", priceBookKey: "ceramic_tile_m2", qtyPerUnit: "1" }],
    wastePct: "5", markupPct: "15",
  }],
};

describe("matchLine", () => {
  it("returns a deterministic match when the corpus already knows the signature", async () => {
    const trade = `tiling_${Date.now()}`;
    const tags = { material: "ceramic", dimensions: "60x60", category: "floor" };
    await recordTagging({ trade, rawText: "بلاط سيراميك", tags, costModelId: "tiling.ceramic_floor" });
    // adapter should NOT be called on a deterministic hit — inject one that throws if used.
    const adapter = makeAdapter(async () => { throw new Error("must not call AI on deterministic hit"); });
    const r = await matchLine(adapter, trade, tags, { ...skill, trade }, "بلاط سيراميك");
    expect(r).toMatchObject({ costModelId: "tiling.ceramic_floor", method: "deterministic", confidence: 1 });
  });

  it("falls back to a semantic match via the adapter when the corpus is empty", async () => {
    const trade = `tiling_${Date.now()}_2`;
    const adapter = makeAdapter(async () => '{"costModelId":"tiling.ceramic_floor","confidence":0.8}');
    const r = await matchLine(adapter, trade, { material: "porcelain", category: "floor" }, { ...skill, trade }, "بورسلان أرضيات");
    expect(r).toMatchObject({ costModelId: "tiling.ceramic_floor", method: "semantic" });
    expect(r?.confidence).toBeCloseTo(0.8);
  });

  it("returns null when the semantic matcher declines (no fitting model)", async () => {
    const trade = `tiling_${Date.now()}_3`;
    const adapter = makeAdapter(async () => '{"costModelId":null,"confidence":0}');
    const r = await matchLine(adapter, trade, { material: "mystery" }, { ...skill, trade }, "شيء غريب");
    expect(r).toBeNull();
  });
});
```

`tests/pipeline/tag.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { tagLine } from "@/lib/pipeline/tag";
import { makeAdapter } from "@/lib/ai/adapter";

describe("tagLine", () => {
  it("returns structured tags parsed from the adapter and persists them", async () => {
    const adapter = makeAdapter(async () => '{"material":"ceramic","dimensions":"60x60","category":"floor","standardRefs":["م.ق.أ 374/1"]}');
    const tags = await tagLine(adapter, `tiling_${Date.now()}`, {
      sortOrder: 0, sectionRef: "5", descriptionOriginal: "بلاط سيراميك 60x60 حسب م.ق.أ 374/1",
    });
    expect(tags.material).toBe("ceramic");
    expect(tags.standardRefs).toContain("م.ق.أ 374/1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/pipeline/tag.test.ts tests/pipeline/match.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement `src/lib/pipeline/tag.ts`**

```ts
import { z } from "zod";
import type { AIAdapter } from "@/lib/ai/adapter";
import type { RawLine } from "@/lib/ingest/types";
import { recordTagging, type LineTags } from "@/lib/db/corpus";

export const TAGS_SCHEMA = z.object({
  material: z.string().optional(),
  dimensions: z.string().optional(),
  grade: z.string().optional(),
  category: z.string().optional(),
  standardRefs: z.array(z.string()).optional(),
});

const TAG_SYSTEM = `أنت تصنّف بنود جداول الكميات الإنشائية. من وصف البند، استخرج سمات منظمة:
material (المادة)، dimensions (الأبعاد/السماكة)، grade (الدرجة/الرتبة)، category (التصنيف الوظيفي)، standardRefs (أرقام المواصفات المذكورة).
لا تُسعّر. أعِد JSON فقط بهذه المفاتيح؛ اترك أي مفتاح غير معروف فارغاً.`;

export async function tagLine(adapter: AIAdapter, trade: string, line: RawLine): Promise<LineTags> {
  const tags = await adapter.run<LineTags>({
    system: TAG_SYSTEM,
    prompt: `وصف البند: «${line.descriptionOriginal}»\nالوحدة: ${line.unitRaw ?? "غير محددة"}`,
    schema: TAGS_SCHEMA,
  });
  await recordTagging({ trade, rawText: line.descriptionOriginal, tags });
  return tags;
}
```

- [ ] **Step 4: Implement `src/lib/pipeline/match.ts`**

```ts
import { z } from "zod";
import type { AIAdapter } from "@/lib/ai/adapter";
import type { SkillContent } from "@/lib/domain/skill-schema";
import { lookupBySignature, recordTagging, type LineTags } from "@/lib/db/corpus";

export interface MatchResult {
  trade: string; costModelId: string; method: "deterministic" | "semantic"; confidence: number;
}

const SEMANTIC_SCHEMA = z.object({
  costModelId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export async function matchLine(
  adapter: AIAdapter, trade: string, tags: LineTags, skill: SkillContent, rawText: string,
): Promise<MatchResult | null> {
  // 1. Deterministic fast path: has this exact tag-signature resolved before?
  const hit = await lookupBySignature(trade, tags);
  if (hit) return { trade, costModelId: hit.costModelId, method: "deterministic", confidence: 1 };

  // 2. Semantic fallback: let the LLM pick the nearest cost model from THIS trade's catalog.
  //    It returns only an id + confidence — never a rate.
  const catalog = skill.costModels.map((m) => `- ${m.id}: ${m.labelAr} [${m.unit}] كلمات مفتاحية: ${m.keywords.join("، ")}`).join("\n");
  const res = await adapter.run<z.infer<typeof SEMANTIC_SCHEMA>>({
    system: `اختر نموذج التسعير الأنسب من القائمة لبند جدول الكميات. أعِد المعرّف (id) الأقرب أو null إن لم يوجد ما يناسب. لا تُسعّر.`,
    prompt: `البند: «${rawText}»\nالسمات: ${JSON.stringify(tags)}\n\nنماذج التسعير المتاحة:\n${catalog}\n\nأعِد JSON: {"costModelId": "<id> أو null", "confidence": 0..1}`,
    schema: SEMANTIC_SCHEMA,
  });
  if (!res.costModelId) return null;
  if (!skill.costModels.some((m) => m.id === res.costModelId)) return null; // guard hallucinated ids

  // Record the semantic resolution so next time this signature is deterministic.
  await recordTagging({ trade, rawText, tags, costModelId: res.costModelId });
  return { trade, costModelId: res.costModelId, method: "semantic", confidence: res.confidence };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/pipeline/tag.test.ts tests/pipeline/match.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/pipeline/tag.ts src/lib/pipeline/match.ts tests/pipeline
git commit -m "feat: tagger + matcher (deterministic corpus lookup, LLM semantic fallback)"
```

---

### Task 9: Assemble → priceQuote (with PRICE_UNIT_MISMATCH)

**Files:**
- Create: `src/lib/pipeline/assemble.ts`
- Test: `tests/pipeline/assemble.test.ts`

**Interfaces:**
- Consumes: `RawLine` (Task 3), `classifyItemType` (Task 6), `MatchResult` (Task 8), `normalizeUnit`/`parseQuantityToThousandths` (Phase 1), `priceQuote`/`MatchedItem` (Phase 1), `CostModel`/`SkillContent` (Phase 1), `PriceSnapshot` (Phase 1)
- Produces:
  - `function toMatchedItem(line: RawLine, itemType: ItemType, match: MatchResult | null): MatchedItem`
  - `function priceUnitMismatchFlags(items, skills, snapshot): Flag[]` — the reserved `PRICE_UNIT_MISMATCH` check: for each priced unit-rate item, confirm each labor/material component's price-book entry `unit` is compatible with what the component assumes (labor→day/hr, material by the model unit). Emits a warning flag; never blocks pricing.
  - `async function assembleAndPrice(input): Promise<{ lines: PricedLine[]; rollup; projectFlags: Flag[] }>` — thin wrapper: build MatchedItems, call `priceQuote`, then append price-unit-mismatch flags to the relevant lines.

- [ ] **Step 1: Write the failing test**

`tests/pipeline/assemble.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { toMatchedItem, priceUnitMismatchFlags } from "@/lib/pipeline/assemble";
import type { SkillContent } from "@/lib/domain/skill-schema";
import type { PriceSnapshot } from "@/lib/domain/types";

describe("toMatchedItem", () => {
  it("normalizes unit + quantity and carries the match through", () => {
    const mi = toMatchedItem(
      { sortOrder: 0, itemCode: "5/4", sectionRef: "5", descriptionOriginal: "بلاط", unitRaw: "م2", quantityRaw: "2700" },
      "unit_rate",
      { trade: "tiling", costModelId: "tiling.ceramic_floor", method: "deterministic", confidence: 1 },
    );
    expect(mi.unitCanonical).toBe("m2");
    expect(mi.quantityThousandths).toBe(2_700_000);
    expect(mi.match?.costModelId).toBe("tiling.ceramic_floor");
  });
  it("yields null unit + null quantity when unparseable (downstream flags them)", () => {
    const mi = toMatchedItem(
      { sortOrder: 1, sectionRef: "9", descriptionOriginal: "بند غريب", unitRaw: "bananas", quantityRaw: "abc" },
      "unit_rate", null,
    );
    expect(mi.unitCanonical).toBeNull();
    expect(mi.quantityThousandths).toBeNull();
    expect(mi.match).toBeNull();
  });
});

describe("priceUnitMismatchFlags", () => {
  it("flags a labor component whose price-book entry unit is not day/hr", () => {
    const skill: SkillContent = {
      trade: "tiling",
      costModels: [{
        id: "tiling.ceramic_floor", labelAr: "بلاط", unit: "m2", keywords: [],
        components: [{ id: "tiler", kind: "labor", labelAr: "مبلط", priceBookKey: "tiler_rate", productivityPerDay: "15" }],
        wastePct: "5", markupPct: "15",
      }],
    };
    const snapshot: PriceSnapshot = {
      tiler_rate: { priceFils: 25000, entryId: "e", effectiveDate: "2026-07-01", unit: "m2" }, // WRONG: labor priced per m2
    };
    const items = [{ id: "i1", sectionRef: "5", itemType: "unit_rate" as const, unitCanonical: "m2" as const, quantityThousandths: 1000, match: { trade: "tiling", costModelId: "tiling.ceramic_floor", method: "deterministic" as const, confidence: 1 } }];
    const flags = priceUnitMismatchFlags(items, { tiling: { content: skill, versionId: "v" } }, snapshot);
    expect(flags.map((f) => f.code)).toContain("PRICE_UNIT_MISMATCH");
  });
  it("passes when labor entry is a day rate", () => {
    const skill: SkillContent = {
      trade: "tiling",
      costModels: [{ id: "m", labelAr: "x", unit: "m2", keywords: [], components: [{ id: "l", kind: "labor", labelAr: "l", priceBookKey: "k", productivityPerDay: "15" }], wastePct: "5", markupPct: "15" }],
    };
    const snapshot: PriceSnapshot = { k: { priceFils: 25000, entryId: "e", effectiveDate: "2026-07-01", unit: "day" } };
    const items = [{ id: "i1", sectionRef: "5", itemType: "unit_rate" as const, unitCanonical: "m2" as const, quantityThousandths: 1000, match: { trade: "tiling", costModelId: "m", method: "deterministic" as const, confidence: 1 } }];
    expect(priceUnitMismatchFlags(items, { tiling: { content: skill, versionId: "v" } }, snapshot)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/pipeline/assemble.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/lib/pipeline/assemble.ts`**

```ts
import type { RawLine } from "@/lib/ingest/types";
import type { CanonicalUnit, Flag, ItemType, PriceSnapshot } from "@/lib/domain/types";
import type { SkillContent } from "@/lib/domain/skill-schema";
import { normalizeUnit, parseQuantityToThousandths } from "@/lib/domain/normalize";
import { priceQuote, type MatchedItem, type PricedLine } from "@/lib/domain/price-quote";
import type { MatchResult } from "./match";
import type { QuoteRollup } from "@/lib/domain/rollup";

export function toMatchedItem(line: RawLine, itemType: ItemType, match: MatchResult | null): MatchedItem {
  let unitCanonical: CanonicalUnit | null = null;
  if (line.unitRaw) unitCanonical = normalizeUnit(line.unitRaw);
  let quantityThousandths: number | null = null;
  if (line.quantityRaw) { try { quantityThousandths = parseQuantityToThousandths(line.quantityRaw); } catch { quantityThousandths = null; } }
  return {
    id: line.itemCode ?? `row-${line.sortOrder}`,
    sectionRef: line.sectionRef,
    itemType,
    unitCanonical,
    quantityThousandths,
    match: match ? { trade: match.trade, costModelId: match.costModelId, method: match.method, confidence: match.confidence } : null,
  };
}

// labor components must be priced per day or hour; material/equipment per the model's output unit.
export function priceUnitMismatchFlags(
  items: MatchedItem[],
  skills: Record<string, { content: SkillContent; versionId: string }>,
  snapshot: PriceSnapshot,
): Flag[] {
  const flags: Flag[] = [];
  for (const item of items) {
    if (item.itemType !== "unit_rate" || !item.match) continue;
    const model = skills[item.match.trade]?.content.costModels.find((m) => m.id === item.match!.costModelId);
    if (!model) continue;
    for (const c of model.components) {
      const entry = snapshot[c.priceBookKey];
      if (!entry) continue;
      const ok = c.kind === "labor" ? (entry.unit === "day" || entry.unit === "night" || entry.unit === "hr") : true;
      if (!ok) {
        flags.push({
          code: "PRICE_UNIT_MISMATCH", severity: "warning",
          messageAr: `وحدة سعر «${c.labelAr}» (${entry.unit}) لا تناسب مكوّن العمالة — يُتوقع سعر يومي/ساعي`,
          detail: { itemId: item.id, component: c.id, priceUnit: entry.unit },
        });
      }
    }
  }
  return flags;
}

export function assembleAndPrice(input: {
  items: MatchedItem[];
  skills: Record<string, { content: SkillContent; versionId: string }>;
  snapshot: PriceSnapshot;
}): { lines: PricedLine[]; rollup: QuoteRollup; projectFlags: Flag[] } {
  const result = priceQuote({ items: input.items, skills: input.skills, snapshot: input.snapshot });
  const extra = priceUnitMismatchFlags(input.items, input.skills, input.snapshot);
  // attach each price-unit flag to its line
  for (const f of extra) {
    const itemId = (f.detail as { itemId: string }).itemId;
    const line = result.lines.find((l) => l.id === itemId);
    if (line) line.flags.push(f);
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/pipeline/assemble.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/assemble.ts tests/pipeline/assemble.test.ts
git commit -m "feat: assemble MatchedItems + wire priceQuote + PRICE_UNIT_MISMATCH check"
```

---

### Task 10: Priced-BOQ Export (JSON + Excel)

**Files:**
- Create: `src/lib/export/priced-boq.ts`
- Test: `tests/export/priced-boq.test.ts`

**Interfaces:**
- Consumes: `PricedLine`/`QuoteRollup`/`Flag` (Phase 1), `RawLine` (Task 3), `filsToJDString` (Phase 1)
- Produces:
  - `interface PricedRow { itemCode?: string; sectionRef: string; description: string; unit?: string; quantity?: string; rateJD: string | null; amountJD: string | null; flags: string[] }`
  - `function toPricedRows(rawLines: RawLine[], lines: PricedLine[]): PricedRow[]`
  - `async function writePricedExcel(path: string, rows: PricedRow[], rollup: QuoteRollup): Promise<void>` (exceljs, `views:[{rightToLeft:true}]`)
  - `function toPricedJson(rows, rollup, projectFlags): object`

- [ ] **Step 1: Add exceljs**

Run: `npm install exceljs`

- [ ] **Step 2: Write the failing test** (pure row mapping; the Excel writer is smoke-checked by file existence)

`tests/export/priced-boq.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { toPricedRows } from "@/lib/export/priced-boq";
import type { RawLine } from "@/lib/ingest/types";
import type { PricedLine } from "@/lib/domain/price-quote";

describe("toPricedRows", () => {
  it("joins raw lines with priced results, formatting fils as JD strings", () => {
    const raw: RawLine[] = [{ sortOrder: 0, itemCode: "5/4", sectionRef: "5", descriptionOriginal: "بلاط", unitRaw: "م2", quantityRaw: "2700" }];
    const priced: PricedLine[] = [{ id: "5/4", rateFils: 13_388, amountFils: 36_147_600, breakdown: null, flags: [], provenance: {} }];
    const rows = toPricedRows(raw, priced);
    expect(rows[0]).toMatchObject({ itemCode: "5/4", description: "بلاط", unit: "م2", quantity: "2700", rateJD: "13.388", amountJD: "36147.600", flags: [] });
  });
  it("shows null rate/amount for unpriced/flagged lines", () => {
    const raw: RawLine[] = [{ sortOrder: 0, itemCode: "9/1", sectionRef: "9", descriptionOriginal: "بند غريب" }];
    const priced: PricedLine[] = [{ id: "9/1", rateFils: null, amountFils: null, breakdown: null, flags: [{ code: "NO_MATCH", severity: "error", messageAr: "لا مطابقة" }], provenance: {} }];
    const rows = toPricedRows(raw, priced);
    expect(rows[0].rateJD).toBeNull();
    expect(rows[0].flags).toContain("NO_MATCH");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/export/priced-boq.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement `src/lib/export/priced-boq.ts`**

```ts
import ExcelJS from "exceljs";
import type { RawLine } from "@/lib/ingest/types";
import type { PricedLine } from "@/lib/domain/price-quote";
import type { QuoteRollup } from "@/lib/domain/rollup";
import type { Flag } from "@/lib/domain/types";
import { filsToJDString } from "@/lib/domain/money";

export interface PricedRow {
  itemCode?: string; sectionRef: string; description: string; unit?: string; quantity?: string;
  rateJD: string | null; amountJD: string | null; flags: string[];
}

export function toPricedRows(rawLines: RawLine[], lines: PricedLine[]): PricedRow[] {
  const byId = new Map(lines.map((l) => [l.id, l]));
  return rawLines.map((raw) => {
    const id = raw.itemCode ?? `row-${raw.sortOrder}`;
    const p = byId.get(id);
    return {
      itemCode: raw.itemCode, sectionRef: raw.sectionRef, description: raw.descriptionOriginal,
      unit: raw.unitRaw, quantity: raw.quantityRaw,
      rateJD: p?.rateFils != null ? filsToJDString(p.rateFils) : null,
      amountJD: p?.amountFils != null ? filsToJDString(p.amountFils) : null,
      flags: (p?.flags ?? []).map((f) => f.code),
    };
  });
}

export function toPricedJson(rows: PricedRow[], rollup: QuoteRollup, projectFlags: Flag[]) {
  return {
    rows,
    sections: rollup.sections.map((s) => ({ ...s, totalJD: filsToJDString(s.totalFils) })),
    grandTotalJD: filsToJDString(rollup.grandTotalFils),
    projectFlags: projectFlags.map((f) => ({ code: f.code, messageAr: f.messageAr })),
  };
}

export async function writePricedExcel(path: string, rows: PricedRow[], rollup: QuoteRollup): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("عرض السعر", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: "الرقم", key: "itemCode", width: 10 },
    { header: "الوصف", key: "description", width: 50 },
    { header: "الوحدة", key: "unit", width: 8 },
    { header: "الكمية", key: "quantity", width: 12 },
    { header: "سعر الوحدة (د.أ)", key: "rateJD", width: 16 },
    { header: "المبلغ (د.أ)", key: "amountJD", width: 16 },
    { header: "ملاحظات", key: "flags", width: 24 },
  ];
  for (const r of rows) ws.addRow({ ...r, flags: r.flags.join(", ") });
  ws.addRow({});
  ws.addRow({ description: "المجموع الكلي", amountJD: filsToJDString(rollup.grandTotalFils) });
  await wb.xlsx.writeFile(path);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/export/priced-boq.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/priced-boq.ts tests/export/priced-boq.test.ts package.json package-lock.json
git commit -m "feat: priced-BOQ export (JSON + RTL Excel via exceljs)"
```

---

### Task 11: Seeding from Priced Examples (human-reviewed)

**Files:**
- Create: `src/lib/seed/seed-from-priced.ts`, `scripts/seed.ts`
- Test: `tests/seed/seed-from-priced.test.ts`

**Interfaces:**
- Consumes: `AIAdapter` (Task 1), `SkillContentSchema`/`CostModel` (Phase 1), `createSkill`/`createSkillVersion`/`activateSkillVersion` (Phase 1), `addPriceEntry` (Phase 1)
- Produces:
  - `const DRAFT_SKILL_SCHEMA` (Zod, = SkillContentSchema) ; `const DRAFT_PRICEBOOK_SCHEMA`
  - `async function draftTradeSkill(adapter, trade, pricedExamplesPath): Promise<{ skill: SkillContent; priceBook: Array<{ key; labelAr; unit; priceFils }> }>` — AI drafts cost models + the price-book keys they reference from a priced example doc; returns a DRAFT for human review (does NOT auto-activate)
  - `async function persistReviewedSkill(trade, nameAr, skill, priceBook): Promise<void>` — writes the price book, creates + activates the skill version (called only after human review)

- [ ] **Step 1: Write the failing test** (draft parsing with an injected fake adapter; persistence against the real DB)

`tests/seed/seed-from-priced.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { draftTradeSkill, persistReviewedSkill } from "@/lib/seed/seed-from-priced";
import { getActiveSkill } from "@/lib/db/skills";
import { getSnapshot } from "@/lib/db/price-book";
import { makeAdapter } from "@/lib/ai/adapter";

const draftJson = JSON.stringify({
  skill: {
    trade: "tiling",
    costModels: [{
      id: "tiling.ceramic_floor", labelAr: "بلاط سيراميك أرضيات", unit: "m2", keywords: ["سيراميك"],
      components: [
        { id: "tile", kind: "material", labelAr: "بلاط", priceBookKey: "ceramic_tile_m2", qtyPerUnit: "1" },
        { id: "tiler", kind: "labor", labelAr: "مبلط", priceBookKey: "tiler_day_rate", productivityPerDay: "15" },
      ],
      wastePct: "5", markupPct: "15",
    }],
  },
  priceBook: [
    { key: "ceramic_tile_m2", labelAr: "بلاط سيراميك", unit: "m2", priceFils: 8000 },
    { key: "tiler_day_rate", labelAr: "أجرة مبلط", unit: "day", priceFils: 25000 },
  ],
});

describe("seeding", () => {
  it("drafts a schema-valid skill + price book from an example", async () => {
    const adapter = makeAdapter(async () => draftJson);
    const draft = await draftTradeSkill(adapter, "tiling", "reference-docs/example.pdf");
    expect(draft.skill.costModels[0].id).toBe("tiling.ceramic_floor");
    expect(draft.priceBook).toHaveLength(2);
  });

  it("persists a reviewed skill: price book entries + an active skill version", async () => {
    const adapter = makeAdapter(async () => draftJson);
    const slug = `tiling_seed_${Date.now()}`;
    const draft = await draftTradeSkill(adapter, "tiling", "x");
    await persistReviewedSkill(slug, "أعمال البلاط", draft.skill, draft.priceBook);
    const active = await getActiveSkill(slug);
    expect(active?.content.costModels[0].id).toBe("tiling.ceramic_floor");
    const snap = await getSnapshot();
    expect(snap["ceramic_tile_m2"]?.priceFils).toBe(8000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/seed/seed-from-priced.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/lib/seed/seed-from-priced.ts`**

```ts
import { z } from "zod";
import type { AIAdapter } from "@/lib/ai/adapter";
import { SkillContentSchema, type SkillContent } from "@/lib/domain/skill-schema";
import { createSkill, createSkillVersion, activateSkillVersion } from "@/lib/db/skills";
import { addPriceEntry } from "@/lib/db/price-book";

const PriceBookDraft = z.array(z.object({
  key: z.string(), labelAr: z.string(), unit: z.string(), priceFils: z.number().int().nonnegative(),
}));
export const DRAFT_SCHEMA = z.object({ skill: SkillContentSchema, priceBook: PriceBookDraft });

const SEED_SYSTEM = `أنت مهندس تسعير خبير في السوق الأردني. من مستند جدول كميات مُسعّر، اشتقّ نماذج تسعير (cost models)
لهذه المهنة: لكل نموذج مكوّنات (مواد/عمالة/معدات) مع مفاتيح دفتر أسعار، ونِسَب الهدر والربح، وإنتاجية العمالة (وحدة/يوم).
هذا تقدير أولي للمراجعة البشرية. لا تُدرج الأسعار النهائية المخلوطة؛ فكّكها إلى مكوّنات. أعِد JSON بالشكل {"skill":{...},"priceBook":[...]}.`;

export async function draftTradeSkill(adapter: AIAdapter, trade: string, pricedExamplesPath: string) {
  const draft = await adapter.run<z.infer<typeof DRAFT_SCHEMA>>({
    system: SEED_SYSTEM,
    prompt: `المهنة: ${trade}. استخرج نماذج التسعير ومفاتيح دفتر الأسعار من المستند المُسعّر المرفق.`,
    files: pricedExamplesPath === "x" ? undefined : [pricedExamplesPath],
    schema: DRAFT_SCHEMA,
  });
  return draft;
}

export async function persistReviewedSkill(
  slug: string, nameAr: string, skill: SkillContent,
  priceBook: Array<{ key: string; labelAr: string; unit: string; priceFils: number }>,
): Promise<void> {
  for (const e of priceBook) {
    await addPriceEntry({ key: e.key, labelAr: e.labelAr, unit: e.unit, priceFils: e.priceFils });
  }
  const { id } = await createSkill(slug, nameAr);
  const v = await createSkillVersion(id, skill, "بذرة أولية من مثال مُسعّر (مراجَعة)");
  await activateSkillVersion(id, v.id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/seed/seed-from-priced.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write `scripts/seed.ts`** (the human-in-the-loop CLI: draft → print for review → persist on confirm)

```ts
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { claudeCliAdapter } from "@/lib/ai/claude-cli";
import { draftTradeSkill, persistReviewedSkill } from "@/lib/seed/seed-from-priced";

// Two modes:
//   draft:   npx tsx scripts/seed.ts draft <trade> <slug> <nameAr> <pricedDoc>  → writes seed-draft-<slug>.json for review
//   persist: npx tsx scripts/seed.ts persist <slug> <nameAr>                    → persists the reviewed json
async function main() {
  const [mode] = process.argv.slice(2);
  const adapter = claudeCliAdapter({ timeoutMs: 240_000 });
  if (mode === "draft") {
    const [, trade, slug, nameAr, doc] = process.argv.slice(2);
    const draft = await draftTradeSkill(adapter, trade, doc);
    const out = `seed-draft-${slug}.json`;
    writeFileSync(out, JSON.stringify({ slug, nameAr, ...draft }, null, 2));
    console.log(`✅ كُتبت المسودة إلى ${out} — راجعها ثم شغّل: npx tsx scripts/seed.ts persist ${slug} "${nameAr}"`);
  } else if (mode === "persist") {
    const [, slug, nameAr] = process.argv.slice(2);
    const file = `seed-draft-${slug}.json`;
    if (!existsSync(file)) throw new Error(`لا توجد مسودة ${file} — شغّل draft أولاً`);
    const d = JSON.parse(readFileSync(file, "utf8"));
    await persistReviewedSkill(slug, nameAr, d.skill, d.priceBook);
    console.log(`✅ فُعّلت مهارة ${slug} مع دفتر الأسعار.`);
  } else {
    console.log("الاستخدام: seed.ts draft <trade> <slug> <nameAr> <doc>  |  seed.ts persist <slug> <nameAr>");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/seed tests/seed scripts/seed.ts
git commit -m "feat: AI-draft trade-skill + price-book seeding with human-review gate"
```

---

### Task 12: Pipeline CLI (end-to-end wiring)

**Files:**
- Create: `src/lib/pipeline/run.ts`, `scripts/pipeline.ts`
- Modify: `package.json` (add `"pipeline": "tsx scripts/pipeline.ts"` script)
- Test: `tests/pipeline/run.test.ts`

**Interfaces:**
- Consumes: everything above — `ingestExcel`/`ingestPdf`, `classifyItemType`, `tagLine`, `matchLine`, `toMatchedItem`/`assembleAndPrice`, `getActiveProfile`/`getActiveSkill`, `getSnapshot`, export functions, `AIAdapter`
- Produces:
  - `async function runPipeline(input: { file: string; profileSlug: string; adapter: AIAdapter; asOf?: string }): Promise<{ json: object; rows: PricedRow[]; rollup: QuoteRollup; projectFlags: Flag[] }>` — the full orchestration, adapter injected (so a fake adapter drives the test end-to-end without the CLI)

- [ ] **Step 1: Write the failing test** (drive the WHOLE pipeline with an injected fake adapter + real DB; seed a tiny skill/profile in-test)

`tests/pipeline/run.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runPipeline } from "@/lib/pipeline/run";
import { makeAdapter } from "@/lib/ai/adapter";
import { createProfile, createProfileVersion, activateProfileVersion } from "@/lib/db/skills";
import { persistReviewedSkill } from "@/lib/seed/seed-from-priced";
import * as XLSX from "xlsx";
import { writeFileSync, mkdirSync } from "node:fs";

const profileSlug = `resi_${Date.now()}`;
const tradeSlug = `tiling_run_${Date.now()}`;
const boq = "tests/fixtures/run-boq.xlsx";

beforeAll(async () => {
  mkdirSync("tests/fixtures", { recursive: true });
  const rows = [["الرقم", "وصف البند", "الوحدة", "الكمية"], ["5/4", "بلاط سيراميك أرضيات", "م2", "2700"]];
  const ws = XLSX.utils.aoa_to_sheet(rows); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BOQ");
  writeFileSync(boq, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

  await persistReviewedSkill(tradeSlug, "أعمال البلاط", {
    trade: tradeSlug,
    costModels: [{
      id: `${tradeSlug}.ceramic_floor`, labelAr: "بلاط سيراميك", unit: "m2", keywords: ["سيراميك", "بلاط"],
      components: [
        { id: "tile", kind: "material", labelAr: "بلاط", priceBookKey: `tile_${tradeSlug}`, qtyPerUnit: "1" },
        { id: "tiler", kind: "labor", labelAr: "مبلط", priceBookKey: `tiler_${tradeSlug}`, productivityPerDay: "15" },
      ],
      wastePct: "5", markupPct: "15",
    }],
  }, [
    { key: `tile_${tradeSlug}`, labelAr: "بلاط", unit: "m2", priceFils: 8000 },
    { key: `tiler_${tradeSlug}`, labelAr: "مبلط", unit: "day", priceFils: 25000 },
  ]);

  const { id } = await createProfile(profileSlug, "سكني");
  const pv = await createProfileVersion(id, { trades: [tradeSlug], ratioChecks: [] }, "v1");
  await activateProfileVersion(id, pv.id);
});

describe("runPipeline (end to end, fake adapter)", () => {
  it("ingests → tags → matches → prices an Excel BOQ", async () => {
    // Fake adapter answers both the tag call and the semantic-match call by shape.
    const adapter = makeAdapter(async (req) => {
      if (req.prompt.includes("نماذج التسعير المتاحة")) return `{"costModelId":"${tradeSlug}.ceramic_floor","confidence":0.9}`;
      return '{"material":"ceramic","dimensions":"60x60","category":"floor"}';
    });
    const out = await runPipeline({ file: boq, profileSlug, adapter });
    const row = out.rows.find((r) => r.itemCode === "5/4")!;
    expect(row.rateJD).toBe("13.388");             // Phase 1 pricing, proven
    expect(row.amountJD).toBe("36147.600");        // 2700 × 13.388
    expect(out.rollup.grandTotalFils).toBe(36_147_600);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/pipeline/run.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/lib/pipeline/run.ts`**

```ts
import type { AIAdapter } from "@/lib/ai/adapter";
import { ingestExcel } from "@/lib/ingest/excel";
import { ingestPdf } from "@/lib/ingest/pdf";
import { classifyItemType } from "@/lib/ingest/item-type-gate";
import { tagLine } from "./tag";
import { matchLine } from "./match";
import { toMatchedItem, assembleAndPrice } from "./assemble";
import { getActiveProfile, getActiveSkill } from "@/lib/db/skills";
import { getSnapshot } from "@/lib/db/price-book";
import type { SkillContent } from "@/lib/domain/skill-schema";
import { toPricedRows, toPricedJson, type PricedRow } from "@/lib/export/priced-boq";
import type { RawLine } from "@/lib/ingest/types";

export async function runPipeline(input: { file: string; profileSlug: string; adapter: AIAdapter; asOf?: string }) {
  // 1. Ingest
  const isExcel = /\.xlsx?$/i.test(input.file) || /\.xlsm$/i.test(input.file);
  const extraction = isExcel ? ingestExcel(input.file) : await ingestPdf(input.file, input.adapter);
  const rawLines: RawLine[] = extraction.lines;

  // 2. Load the profile + its active skills + a price snapshot
  const profile = await getActiveProfile(input.profileSlug);
  if (!profile) throw new Error(`ملف المشروع «${input.profileSlug}» غير مفعّل`);
  const skills: Record<string, { content: SkillContent; versionId: string }> = {};
  for (const tradeSlug of profile.content.trades) {
    const s = await getActiveSkill(tradeSlug);
    if (s) skills[s.content.trade] = { content: s.content, versionId: s.versionId };
  }
  const snapshot = await getSnapshot(input.asOf);

  // 3. Per line: classify → (unit_rate only) tag + match → MatchedItem
  const tradeSlugs = Object.keys(skills);
  const items = [];
  for (const line of rawLines) {
    const { itemType } = classifyItemType(line);
    let match = null;
    if (itemType === "unit_rate") {
      // Try each active trade until one yields a match. (Small trade set per profile.)
      for (const trade of tradeSlugs) {
        const tags = await tagLine(input.adapter, trade, line);
        match = await matchLine(input.adapter, trade, tags, skills[trade].content, line.descriptionOriginal);
        if (match) break;
      }
    }
    items.push(toMatchedItem(line, itemType, match));
  }

  // 4. Price + flag
  const result = assembleAndPrice({ items, skills, snapshot });
  const rows = toPricedRows(rawLines, result.lines);
  const json = toPricedJson(rows, result.rollup, result.projectFlags);
  return { json, rows, rollup: result.rollup, projectFlags: result.projectFlags };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/pipeline/run.test.ts`
Expected: PASS

- [ ] **Step 5: Write `scripts/pipeline.ts` + add the npm script**

`scripts/pipeline.ts`:
```ts
import { writeFileSync } from "node:fs";
import { claudeCliAdapter } from "@/lib/ai/claude-cli";
import { runPipeline } from "@/lib/pipeline/run";
import { writePricedExcel } from "@/lib/export/priced-boq";

// npm run pipeline -- --file <boq> --type <profileSlug> [--out <name>]
async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => { const i = args.indexOf(flag); return i === -1 ? undefined : args[i + 1]; };
  const file = get("--file"); const profileSlug = get("--type"); const out = get("--out") ?? "priced-boq";
  if (!file || !profileSlug) { console.error("الاستخدام: npm run pipeline -- --file <boq> --type <profileSlug>"); process.exit(1); }

  const adapter = claudeCliAdapter({ timeoutMs: 240_000 });
  const result = await runPipeline({ file, profileSlug, adapter });
  writeFileSync(`${out}.json`, JSON.stringify(result.json, null, 2));
  await writePricedExcel(`${out}.xlsx`, result.rows, result.rollup);
  const flagged = result.rows.filter((r) => r.flags.length).length;
  console.log(`✅ سُعّر ${result.rows.length} بنداً (${flagged} بحاجة لمراجعة). المجموع: ${result.json["grandTotalJD"]} د.أ`);
  console.log(`   المخرجات: ${out}.json و ${out}.xlsx`);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Add to `package.json` scripts: `"pipeline": "tsx scripts/pipeline.ts"`. Run `npm install -D tsx` if not present.

- [ ] **Step 6: Full suite + commit**

Run: `npm test` (expect all green: Phase 1's 47 + the new Phase 2 tests)
```bash
git add src/lib/pipeline/run.ts scripts/pipeline.ts package.json package-lock.json tests/pipeline/run.test.ts
git commit -m "feat: end-to-end pipeline CLI (ingest → tag → match → price → export)"
```

---

## Self-Review Notes

- **Spec coverage:** Phase 2 outline items all have tasks — AIAdapter (T1), Arabic words parser (T2), Excel (T3), PDF vision+chunking (T4), live smoke (T5), item-type gate (T6), corpus persistence (T7), tagger+matcher (T8), assemble→priceQuote (T9), export (T10), seeding (T11), pipeline CLI (T12). The reserved `PRICE_UNIT_MISMATCH` (Phase 1 carry-forward) is implemented in T9.
- **The LLM-never-prices constraint** holds: the tagger returns attributes, the matcher returns a cost-model id + confidence (never a rate), seeding returns a draft for human review. All arithmetic stays in Phase 1 code.
- **Adapter isolation:** only `claude-cli.ts` imports `child_process`; every other module takes an `AIAdapter` and is tested with an injected fake — so the whole pipeline is unit-testable without the real CLI, and the live path is proven once in T5 and again in real runs.
- **Type consistency:** `MatchedItem`, `PricedLine`, `CanonicalUnit`, `ItemType`, `SkillContent`, `PriceSnapshot`, `Flag` are all consumed verbatim from Phase 1 (signatures pinned at top). `RawLine`, `LineTags`, `MatchResult`, `PricedRow` are defined once and consumed consistently downstream.
- **Acceptance-test path:** seed the trades the user's document needs (T11, human-reviewed), then `npm run pipeline -- --file <doc> --type <profile>` → priced JSON + RTL Excel to score against the human. T5 + real runs cover the live CLI; the unit suite covers logic deterministically.
- **Known gap deferred to Phase 3 (correct):** matcher tries each active trade sequentially — fine for small per-profile trade sets; a section→trade routing map is a Phase 3 optimization, noted not silently dropped.
