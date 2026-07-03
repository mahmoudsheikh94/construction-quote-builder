# Phase 1: Domain Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fully tested, headless domain core: schema + repositories for projects/quotes/line items, dated price book, versioned trade skills/profiles, and a deterministic pricing engine (cost models → rates → rollups → flags) provable from `npm test`.

**Architecture:** Pure domain logic in `src/lib/domain/` (no I/O), Supabase repositories in `src/lib/db/`, SQL migrations per task. The LLM is entirely absent from this phase — pricing is code.

**Tech Stack:** Next.js 16 (manual scaffold), TypeScript strict, Supabase local (Docker), supabase-js v2, Zod 4, Vitest.

## Global Constraints

(Copied from master roadmap — every task inherits these.)

- Money = integer **fils** (1 JD = 1000 fils). No floats in money paths. Rounding: half-up at the fils, per component.
- Quantities = integer **thousandths**. Model parameters (qty-per-unit, percentages, productivity) = decimal **strings**, evaluated as BigInt micro-units (×1,000,000).
- LLM never does arithmetic (no LLM in this phase at all).
- Arabic-first: flags carry `messageAr`; layout scaffolded `lang="ar" dir="rtl"`.
- Skill/profile versions immutable (DB-trigger enforced); creation ≠ activation.
- TDD; commit at the end of every task.
- Prerequisite: Docker Desktop running (for `supabase start`); Node ≥ 24.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `vitest.config.ts`, `tests/setup.ts`, `tests/smoke.test.ts`
- Modify: `.gitignore`
- Create (via CLI): `supabase/` (config)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: working `npm test` (Vitest), `npm run build` (Next.js), running local Supabase, `.env.local` with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (used by every DB task's tests via `tests/setup.ts`)

- [ ] **Step 1: Move reference documents out of the repo root**

```bash
mkdir -p reference-docs
mv *.pdf *.xlsm reference-docs/
```

(The German tax PDF `250326_FA_Gewerbesteuer.pdf` also moves there; Mahmoud can delete it separately.)

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "construction-quote-builder",
  "private": true,
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "@supabase/supabase-js": "^2.49.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "vitest": "^3.0.0",
    "dotenv": "^17.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "supabase": "^2.0.0"
  }
}
```

Run: `npm install`

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write the Next.js app shell (Arabic RTL from day one)**

`next.config.ts`:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

`postcss.config.mjs`:
```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

`src/app/globals.css`:
```css
@import "tailwindcss";
```

`src/app/layout.tsx`:
```tsx
import "./globals.css";

export const metadata = { title: "منشئ عروض الأسعار الإنشائية" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:
```tsx
export default function Home() {
  return <main className="p-8">منشئ عروض الأسعار — قيد الإنشاء</main>;
}
```

- [ ] **Step 5: Configure Vitest**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { setupFiles: ["tests/setup.ts"], include: ["tests/**/*.test.ts"] },
});
```

`tests/setup.ts`:
```ts
import { config } from "dotenv";
config({ path: ".env.local" });
```

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the smoke test**

Run: `npm test`
Expected: PASS (1 test)

- [ ] **Step 7: Initialize local Supabase**

```bash
npx supabase init
npx supabase start
npx supabase status
```

Copy from `supabase status` output into `.env.local`:
```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<service_role key from status output>
```

Append to `.gitignore`:
```
supabase/.temp/
next-env.d.ts
```

- [ ] **Step 8: Verify build**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 + Vitest + local Supabase, Arabic RTL shell"
```

---

### Task 2: Money Module

**Files:**
- Create: `src/lib/domain/money.ts`
- Test: `tests/domain/money.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces (used by cost engine, rollup, price book, UI):
  - `type Fils = number` (always an integer)
  - `parseJDToFils(s: string): Fils` — `"4.52"` → `4520`; throws on invalid/>3dp/negative
  - `filsToJDString(f: Fils): string` — `4520` → `"4.520"`
  - `parseDecimalToMicro(s: string): bigint` — `"0.05"` → `50000n` (×1e6; ≤6dp; non-negative)
  - `roundDivHalfUp(n: bigint, d: bigint): bigint` — integer division, half-up, `n ≥ 0`, `d > 0`
  - `lineAmountFils(qtyThousandths: number, rateFils: Fils): Fils`
  - `sumFils(xs: Fils[]): Fils`

- [ ] **Step 1: Write the failing tests**

`tests/domain/money.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  parseJDToFils, filsToJDString, parseDecimalToMicro,
  roundDivHalfUp, lineAmountFils, sumFils,
} from "@/lib/domain/money";

describe("parseJDToFils", () => {
  it("parses whole and fractional JD", () => {
    expect(parseJDToFils("4")).toBe(4000);
    expect(parseJDToFils("4.52")).toBe(4520);
    expect(parseJDToFils("0.005")).toBe(5);
  });
  it("rejects more than 3 decimal places, negatives, junk", () => {
    expect(() => parseJDToFils("1.0001")).toThrow();
    expect(() => parseJDToFils("-2")).toThrow();
    expect(() => parseJDToFils("abc")).toThrow();
  });
});

describe("filsToJDString", () => {
  it("always renders 3 decimals", () => {
    expect(filsToJDString(4520)).toBe("4.520");
    expect(filsToJDString(0)).toBe("0.000");
    expect(filsToJDString(1127979500)).toBe("1127979.500");
  });
});

describe("roundDivHalfUp", () => {
  it("rounds half up", () => {
    expect(roundDivHalfUp(5n, 2n)).toBe(3n);   // 2.5 → 3
    expect(roundDivHalfUp(4n, 3n)).toBe(1n);   // 1.33 → 1
    expect(roundDivHalfUp(5n, 3n)).toBe(2n);   // 1.66 → 2
  });
});

describe("parseDecimalToMicro", () => {
  it("scales to millionths", () => {
    expect(parseDecimalToMicro("15")).toBe(15_000_000n);
    expect(parseDecimalToMicro("0.05")).toBe(50_000n);
    expect(parseDecimalToMicro("1.000001")).toBe(1_000_001n);
  });
  it("rejects >6dp and negatives", () => {
    expect(() => parseDecimalToMicro("0.0000001")).toThrow();
    expect(() => parseDecimalToMicro("-1")).toThrow();
  });
});

describe("lineAmountFils", () => {
  it("computes qty × rate with half-up rounding at the fils", () => {
    // 2700 m² × 13.388 JD = 36147.600 JD
    expect(lineAmountFils(2_700_000, 13_388)).toBe(36_147_600);
    // 1.5 units × 0.333 JD = 0.4995 → 0.500 (499.5 fils → 500)
    expect(lineAmountFils(1_500, 333)).toBe(500);
  });
});

describe("sumFils", () => {
  it("sums and rejects non-integers", () => {
    expect(sumFils([100, 200, 3])).toBe(303);
    expect(() => sumFils([1.5])).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/domain/money.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/lib/domain/money.ts`**

```ts
export type Fils = number;

const JD_RE = /^\d+(\.\d{1,3})?$/;
const DEC_RE = /^\d+(\.\d{1,6})?$/;

export function parseJDToFils(s: string): Fils {
  const t = s.trim();
  if (!JD_RE.test(t)) throw new Error(`قيمة دينار غير صالحة: ${s}`);
  const [whole, frac = ""] = t.split(".");
  return Number(whole) * 1000 + Number(frac.padEnd(3, "0"));
}

export function filsToJDString(f: Fils): string {
  assertIntFils(f);
  const jd = Math.floor(f / 1000);
  const fils = f % 1000;
  return `${jd}.${String(fils).padStart(3, "0")}`;
}

export function parseDecimalToMicro(s: string): bigint {
  const t = s.trim();
  if (!DEC_RE.test(t)) throw new Error(`قيمة عشرية غير صالحة: ${s}`);
  const [whole, frac = ""] = t.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(frac.padEnd(6, "0"));
}

export function roundDivHalfUp(n: bigint, d: bigint): bigint {
  if (n < 0n || d <= 0n) throw new Error("roundDivHalfUp: n ≥ 0 و d > 0 مطلوبان");
  const q = n / d;
  const r = n % d;
  return r * 2n >= d ? q + 1n : q;
}

export function lineAmountFils(qtyThousandths: number, rateFils: Fils): Fils {
  assertIntFils(rateFils);
  if (!Number.isInteger(qtyThousandths) || qtyThousandths < 0) {
    throw new Error(`كمية غير صالحة: ${qtyThousandths}`);
  }
  return Number(roundDivHalfUp(BigInt(qtyThousandths) * BigInt(rateFils), 1000n));
}

export function sumFils(xs: Fils[]): Fils {
  return xs.reduce((acc: number, x) => {
    assertIntFils(x);
    return acc + x;
  }, 0);
}

function assertIntFils(f: number): void {
  if (!Number.isInteger(f) || f < 0) throw new Error(`قيمة فلس غير صالحة: ${f}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/domain/money.test.ts`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/money.ts tests/domain/money.test.ts
git commit -m "feat: fils money module — parsing, half-up rounding, line amounts"
```

---

### Task 3: Normalization Module (Arabic digits + units)

**Files:**
- Create: `src/lib/domain/normalize.ts`, `src/lib/domain/types.ts`
- Test: `tests/domain/normalize.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type CanonicalUnit = 'm3'|'m2'|'lm'|'ton'|'nr'|'ls'|'day'|'night'|'pc'|'hr'|'kg'|'pct'` (in `types.ts`)
  - `arabicIndicToLatin(s: string): string` — `"١٨٠٠٠"` → `"18000"` (also converts ٫→. and strips ٬)
  - `parseQuantityToThousandths(s: string): number` — `"١٬٢٠٠٫٥"` → `1200500`; throws on >3dp/invalid
  - `normalizeUnit(raw: string): CanonicalUnit | null` — `null` for unknown (forces a flag downstream)

- [ ] **Step 1: Write the failing tests**

`tests/domain/normalize.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { arabicIndicToLatin, parseQuantityToThousandths, normalizeUnit } from "@/lib/domain/normalize";

describe("arabicIndicToLatin", () => {
  it("converts Arabic-Indic digits and separators", () => {
    expect(arabicIndicToLatin("١٨٠٠٠")).toBe("18000");
    expect(arabicIndicToLatin("١٬٢٠٠٫٥")).toBe("1200.5");
    expect(arabicIndicToLatin("abc 123")).toBe("abc 123");
  });
});

describe("parseQuantityToThousandths", () => {
  it("parses Latin and Arabic-Indic quantities", () => {
    expect(parseQuantityToThousandths("18000")).toBe(18_000_000);
    expect(parseQuantityToThousandths("١٢٠٠")).toBe(1_200_000);
    expect(parseQuantityToThousandths("1,200.5")).toBe(1_200_500);
    expect(parseQuantityToThousandths("٦١")).toBe(61_000);
  });
  it("rejects >3dp and junk", () => {
    expect(() => parseQuantityToThousandths("1.0005")).toThrow();
    expect(() => parseQuantityToThousandths("")).toThrow();
  });
});

describe("normalizeUnit", () => {
  it("maps Arabic and English variants to canonical units", () => {
    expect(normalizeUnit("م٣")).toBe("m3");
    expect(normalizeUnit("م3")).toBe("m3");
    expect(normalizeUnit("M2")).toBe("m2");
    expect(normalizeUnit("م²")).toBe("m2");
    expect(normalizeUnit("م.ط")).toBe("lm");
    expect(normalizeUnit("LM")).toBe("lm");
    expect(normalizeUnit("m")).toBe("lm");
    expect(normalizeUnit("طن")).toBe("ton");
    expect(normalizeUnit("عدد")).toBe("nr");
    expect(normalizeUnit("No.")).toBe("nr");
    expect(normalizeUnit("مقطوع")).toBe("ls");
    expect(normalizeUnit("L.S")).toBe("ls");
    expect(normalizeUnit("يوم")).toBe("day");
    expect(normalizeUnit("ليلة")).toBe("night");
    expect(normalizeUnit("حبة")).toBe("pc");
  });
  it("returns null for unknown units", () => {
    expect(normalizeUnit("bananas")).toBeNull();
    expect(normalizeUnit("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/domain/normalize.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

`src/lib/domain/types.ts`:
```ts
export type CanonicalUnit =
  | "m3" | "m2" | "lm" | "ton" | "nr" | "ls"
  | "day" | "night" | "pc" | "hr" | "kg" | "pct";
```

`src/lib/domain/normalize.ts`:
```ts
import type { CanonicalUnit } from "./types";

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";

export function arabicIndicToLatin(s: string): string {
  let out = "";
  for (const ch of s) {
    const i = ARABIC_INDIC.indexOf(ch);
    if (i >= 0) out += String(i);
    else if (ch === "٫") out += ".";   // Arabic decimal separator
    else if (ch === "٬") continue;      // Arabic thousands separator
    else out += ch;
  }
  return out;
}

export function parseQuantityToThousandths(s: string): number {
  const t = arabicIndicToLatin(s).replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,3})?$/.test(t)) throw new Error(`كمية غير صالحة: ${s}`);
  const [whole, frac = ""] = t.split(".");
  return Number(whole) * 1000 + Number(frac.padEnd(3, "0"));
}

const UNIT_MAP: Record<string, CanonicalUnit> = {
  "م٣": "m3", "م3": "m3", "م³": "m3", "m3": "m3", "cum": "m3", "cu m": "m3",
  "م٢": "m2", "م2": "m2", "م²": "m2", "m2": "m2", "sqm": "m2", "sq m": "m2",
  "م ط": "lm", "مط": "lm", "lm": "lm", "ml": "lm", "m": "lm", "م": "lm",
  "طن": "ton", "ton": "ton", "t": "ton",
  "عدد": "nr", "no": "nr", "nr": "nr", "each": "nr", "ea": "nr",
  "مقطوع": "ls", "بالمقطوع": "ls", "ls": "ls", "lump sum": "ls",
  "يوم": "day", "day": "day",
  "ليلة": "night", "night": "night",
  "حبة": "pc", "pc": "pc", "pcs": "pc",
  "hr": "hr", "ساعة": "hr", "hour": "hr",
  "كغم": "kg", "kg": "kg",
  "%": "pct", "نسبة": "pct",
};

export function normalizeUnit(raw: string): CanonicalUnit | null {
  const key = arabicIndicToLatin(raw)
    .toLowerCase()
    .replace(/[.]/g, raw.includes("م.ط") ? " " : "") // م.ط → "م ط"; latin "No." → "no"
    .replace(/\s+/g, " ")
    .trim();
  // Direct attempt, then retry with dots stripped for Arabic compound units
  return UNIT_MAP[key] ?? UNIT_MAP[key.replace(/\./g, "")] ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/domain/normalize.test.ts`
Expected: PASS. If the `م.ط` case fails, adjust `normalizeUnit` (the dot-handling is the fiddly part) until the full test table passes — do not weaken the tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/normalize.ts src/lib/domain/types.ts tests/domain/normalize.test.ts
git commit -m "feat: Arabic-Indic digit + unit normalization"
```

---

### Task 4: Core Schema + Quotes Repository

**Files:**
- Create: `supabase/migrations/<timestamp>_core_quotes.sql` (via `npx supabase migration new core_quotes`)
- Create: `src/lib/db/client.ts`, `src/lib/db/quotes.ts`
- Test: `tests/db/quotes.test.ts`, `tests/helpers/db.ts`

**Interfaces:**
- Consumes: `CanonicalUnit` (Task 3)
- Produces:
  - `serviceClient(): SupabaseClient` (in `client.ts`, also used by every later repo)
  - `createProject(input: { name: string; projectType?: string; description?: string }): Promise<{ id: string }>`
  - `createQuote(projectId: string): Promise<{ id: string }>`
  - `insertLineItems(quoteId: string, items: NewLineItem[]): Promise<void>`
  - `getQuoteItems(quoteId: string): Promise<LineItemRow[]>` (ordered by `sort_order`)
  - `type NewLineItem = { sortOrder: number; itemCode?: string; sectionRef: string; descriptionOriginal: string; unitRaw?: string; unitCanonical?: CanonicalUnit | null; quantityThousandths?: number | null; itemType?: 'unit_rate'|'provisional_sum'|'dayworks'|'lump_sum'|'percentage' }`

- [ ] **Step 1: Create the migration**

Run: `npx supabase migration new core_quotes`, then fill the generated file:

```sql
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  project_type text,
  description text,
  created_at timestamptz not null default now()
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','review','final')),
  price_snapshot jsonb,
  skill_versions jsonb,
  overrides jsonb,
  created_at timestamptz not null default now()
);

create table line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  sort_order integer not null,
  item_code text,
  section_ref text not null,
  description_original text not null,
  unit_raw text,
  unit_canonical text,
  quantity_thousandths bigint check (quantity_thousandths >= 0),
  item_type text not null default 'unit_rate'
    check (item_type in ('unit_rate','provisional_sum','dayworks','lump_sum','percentage')),
  tags jsonb,
  match jsonb,
  rate_fils bigint check (rate_fils >= 0),
  amount_fils bigint check (amount_fils >= 0),
  breakdown jsonb,
  flags jsonb not null default '[]',
  engineer_edited boolean not null default false,
  provenance jsonb,
  created_at timestamptz not null default now()
);
create index line_items_quote_order on line_items(quote_id, sort_order);

alter table projects enable row level security;
alter table quotes enable row level security;
alter table line_items enable row level security;
-- No policies yet: Phase 1 accesses via service role (bypasses RLS).
-- Phase 3 adds authenticated policies.
```

Run: `npx supabase db reset`
Expected: migration applies cleanly

- [ ] **Step 2: Write the test helper and failing test**

`tests/helpers/db.ts`:
```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function testClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("شغّل npx supabase start وعبّئ .env.local أولاً");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
```

`tests/db/quotes.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createProject, createQuote, insertLineItems, getQuoteItems } from "@/lib/db/quotes";

describe("quotes repository", () => {
  it("creates project → quote → line items and reads them back ordered", async () => {
    const project = await createProject({ name: "مشروع تجريبي", projectType: "residential" });
    const quote = await createQuote(project.id);

    await insertLineItems(quote.id, [
      { sortOrder: 2, sectionRef: "2", descriptionOriginal: "خرسانة عادية", unitRaw: "م٣", unitCanonical: "m3", quantityThousandths: 93_000 },
      { sortOrder: 1, sectionRef: "1", descriptionOriginal: "حفريات", unitRaw: "م٣", unitCanonical: "m3", quantityThousandths: 18_000_000 },
    ]);

    const items = await getQuoteItems(quote.id);
    expect(items).toHaveLength(2);
    expect(items[0].description_original).toBe("حفريات");
    expect(items[1].quantity_thousandths).toBe(93_000);
    expect(items[0].item_type).toBe("unit_rate");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/db/quotes.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement**

`src/lib/db/client.ts`:
```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("متغيرات Supabase البيئية مفقودة");
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
```

`src/lib/db/quotes.ts`:
```ts
import { serviceClient } from "./client";
import type { CanonicalUnit } from "@/lib/domain/types";

export type ItemType = "unit_rate" | "provisional_sum" | "dayworks" | "lump_sum" | "percentage";

export interface NewLineItem {
  sortOrder: number;
  itemCode?: string;
  sectionRef: string;
  descriptionOriginal: string;
  unitRaw?: string;
  unitCanonical?: CanonicalUnit | null;
  quantityThousandths?: number | null;
  itemType?: ItemType;
}

export interface LineItemRow {
  id: string;
  quote_id: string;
  sort_order: number;
  item_code: string | null;
  section_ref: string;
  description_original: string;
  unit_raw: string | null;
  unit_canonical: string | null;
  quantity_thousandths: number | null;
  item_type: ItemType;
  rate_fils: number | null;
  amount_fils: number | null;
  flags: unknown[];
}

export async function createProject(input: { name: string; projectType?: string; description?: string }) {
  const { data, error } = await serviceClient()
    .from("projects")
    .insert({ name: input.name, project_type: input.projectType, description: input.description })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function createQuote(projectId: string) {
  const { data, error } = await serviceClient()
    .from("quotes").insert({ project_id: projectId }).select("id").single();
  if (error) throw error;
  return data;
}

export async function insertLineItems(quoteId: string, items: NewLineItem[]) {
  const rows = items.map((i) => ({
    quote_id: quoteId,
    sort_order: i.sortOrder,
    item_code: i.itemCode,
    section_ref: i.sectionRef,
    description_original: i.descriptionOriginal,
    unit_raw: i.unitRaw,
    unit_canonical: i.unitCanonical,
    quantity_thousandths: i.quantityThousandths,
    item_type: i.itemType ?? "unit_rate",
  }));
  const { error } = await serviceClient().from("line_items").insert(rows);
  if (error) throw error;
}

export async function getQuoteItems(quoteId: string): Promise<LineItemRow[]> {
  const { data, error } = await serviceClient()
    .from("line_items").select("*").eq("quote_id", quoteId).order("sort_order");
  if (error) throw error;
  return data as LineItemRow[];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/db/quotes.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations src/lib/db tests/db tests/helpers
git commit -m "feat: core schema (projects/quotes/line_items) + quotes repository"
```

---

### Task 5: Price Book

**Files:**
- Create: `supabase/migrations/<timestamp>_price_book.sql`
- Create: `src/lib/db/price-book.ts`
- Modify: `src/lib/domain/types.ts` (add snapshot types)
- Test: `tests/db/price-book.test.ts`

**Interfaces:**
- Consumes: `serviceClient()` (Task 4), `Fils` (Task 2)
- Produces:
  - `type PriceSnapshotEntry = { priceFils: number; entryId: string; effectiveDate: string; unit: string }`
  - `type PriceSnapshot = Record<string, PriceSnapshotEntry>` (in `types.ts` — the cost engine's price input)
  - `addPriceEntry(input: { key: string; labelAr: string; unit: string; priceFils: number; effectiveDate?: string }): Promise<{ id: string }>`
  - `getSnapshot(asOf?: string): Promise<PriceSnapshot>` — latest entry per key with `effective_date <= asOf` (default today)
  - `getHistory(key: string): Promise<Array<{ priceFils: number; effectiveDate: string }>>`

- [ ] **Step 1: Migration**

Run: `npx supabase migration new price_book`, fill:

```sql
create table price_book_entries (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  label_ar text not null,
  unit text not null,
  price_fils bigint not null check (price_fils >= 0),
  effective_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index price_book_key_date on price_book_entries(key, effective_date desc);
alter table price_book_entries enable row level security;
```

Run: `npx supabase db reset`

- [ ] **Step 2: Write the failing test**

`tests/db/price-book.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { addPriceEntry, getSnapshot, getHistory } from "@/lib/db/price-book";

describe("price book", () => {
  it("returns the latest effective price per key, respecting asOf", async () => {
    const key = `cement_bag_50kg_${Date.now()}`; // unique per test run
    await addPriceEntry({ key, labelAr: "كيس إسمنت ٥٠ كغم", unit: "pc", priceFils: 4_200, effectiveDate: "2026-01-01" });
    await addPriceEntry({ key, labelAr: "كيس إسمنت ٥٠ كغم", unit: "pc", priceFils: 4_500, effectiveDate: "2026-06-01" });

    const now = await getSnapshot("2026-07-01");
    expect(now[key].priceFils).toBe(4_500);

    const before = await getSnapshot("2026-03-01");
    expect(before[key].priceFils).toBe(4_200);

    const history = await getHistory(key);
    expect(history).toHaveLength(2);
    expect(history[0].priceFils).toBe(4_500); // newest first
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/db/price-book.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement**

Append to `src/lib/domain/types.ts`:
```ts
export interface PriceSnapshotEntry {
  priceFils: number;
  entryId: string;
  effectiveDate: string;
  unit: string;
}
export type PriceSnapshot = Record<string, PriceSnapshotEntry>;
```

`src/lib/db/price-book.ts`:
```ts
import { serviceClient } from "./client";
import type { PriceSnapshot } from "@/lib/domain/types";

export async function addPriceEntry(input: {
  key: string; labelAr: string; unit: string; priceFils: number; effectiveDate?: string;
}) {
  const { data, error } = await serviceClient()
    .from("price_book_entries")
    .insert({
      key: input.key, label_ar: input.labelAr, unit: input.unit,
      price_fils: input.priceFils, effective_date: input.effectiveDate,
    })
    .select("id").single();
  if (error) throw error;
  return data;
}

export async function getSnapshot(asOf?: string): Promise<PriceSnapshot> {
  const date = asOf ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await serviceClient()
    .from("price_book_entries")
    .select("id, key, unit, price_fils, effective_date, created_at")
    .lte("effective_date", date)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const snapshot: PriceSnapshot = {};
  for (const row of data) {
    if (!snapshot[row.key]) {
      snapshot[row.key] = {
        priceFils: Number(row.price_fils), entryId: row.id,
        effectiveDate: row.effective_date, unit: row.unit,
      };
    }
  }
  return snapshot;
}

export async function getHistory(key: string) {
  const { data, error } = await serviceClient()
    .from("price_book_entries")
    .select("price_fils, effective_date")
    .eq("key", key)
    .order("effective_date", { ascending: false });
  if (error) throw error;
  return data.map((r) => ({ priceFils: Number(r.price_fils), effectiveDate: r.effective_date }));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/db/price-book.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations src/lib/db/price-book.ts src/lib/domain/types.ts tests/db/price-book.test.ts
git commit -m "feat: dated price book with as-of snapshots"
```

---

### Task 6: Trade Skills + Profiles with Immutable Versioning

**Files:**
- Create: `supabase/migrations/<timestamp>_skills_profiles.sql`
- Create: `src/lib/db/skills.ts`, `src/lib/domain/skill-schema.ts`
- Test: `tests/db/skills.test.ts`

**Interfaces:**
- Consumes: `serviceClient()` (Task 4), `CanonicalUnit` (Task 3)
- Produces:
  - Zod schemas + types in `skill-schema.ts`:
    - `CostComponent = { id: string; kind: 'material'|'labor'|'equipment'; labelAr: string; priceBookKey: string; qtyPerUnit?: string; productivityPerDay?: string }`
    - `CostModel = { id: string; labelAr: string; unit: CanonicalUnit; keywords: string[]; components: CostComponent[]; wastePct: string; markupPct: string; band?: { minRateFils: number; maxRateFils: number } }`
    - `SkillContent = { trade: string; costModels: CostModel[] }`
    - `ProfileContent = { trades: string[]; ratioChecks: Array<{ sectionMatch: string; minPct: number; maxPct: number; labelAr: string }> }`
  - Repo functions:
    - `createSkill(slug: string, nameAr: string): Promise<{ id: string }>`
    - `createSkillVersion(skillId: string, content: SkillContent, changelog: string): Promise<{ id: string; versionNumber: number }>` (does NOT activate)
    - `activateSkillVersion(skillId: string, versionId: string): Promise<void>`
    - `getActiveSkill(slug: string): Promise<{ content: SkillContent; versionId: string; versionNumber: number } | null>`
    - `listSkillVersions(skillId: string): Promise<Array<{ id: string; versionNumber: number; changelog: string | null; createdAt: string }>>`
    - Same four functions for profiles: `createProfile`, `createProfileVersion`, `activateProfileVersion`, `getActiveProfile`

- [ ] **Step 1: Migration**

Run: `npx supabase migration new skills_profiles`, fill:

```sql
create table trade_skills (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_ar text not null,
  active_version_id uuid,
  created_at timestamptz not null default now()
);

create table skill_versions (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references trade_skills(id) on delete cascade,
  version_number integer not null,
  content jsonb not null,
  changelog text,
  parent_version_id uuid references skill_versions(id),
  created_at timestamptz not null default now(),
  unique (skill_id, version_number)
);

create table project_type_profiles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_ar text not null,
  active_version_id uuid,
  created_at timestamptz not null default now()
);

create table profile_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references project_type_profiles(id) on delete cascade,
  version_number integer not null,
  content jsonb not null,
  changelog text,
  created_at timestamptz not null default now(),
  unique (profile_id, version_number)
);

-- Versions are immutable: block UPDATE of content at the database level.
create or replace function reject_content_update() returns trigger as $$
begin
  if new.content is distinct from old.content
     or new.version_number is distinct from old.version_number then
    raise exception 'skill/profile versions are immutable';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger skill_versions_immutable before update on skill_versions
  for each row execute function reject_content_update();
create trigger profile_versions_immutable before update on profile_versions
  for each row execute function reject_content_update();

alter table trade_skills enable row level security;
alter table skill_versions enable row level security;
alter table project_type_profiles enable row level security;
alter table profile_versions enable row level security;
```

Run: `npx supabase db reset`

- [ ] **Step 2: Write the failing test**

`tests/db/skills.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  createSkill, createSkillVersion, activateSkillVersion,
  getActiveSkill, listSkillVersions,
} from "@/lib/db/skills";
import { testClient } from "../helpers/db";
import type { SkillContent } from "@/lib/domain/skill-schema";

const content = (markup: string): SkillContent => ({
  trade: "tiling",
  costModels: [{
    id: "tiling.ceramic_floor",
    labelAr: "بلاط سيراميك أرضيات",
    unit: "m2",
    keywords: ["سيراميك", "بلاط"],
    components: [
      { id: "tile", kind: "material", labelAr: "بلاط", priceBookKey: "ceramic_tile_m2", qtyPerUnit: "1" },
      { id: "tiler", kind: "labor", labelAr: "مبلط", priceBookKey: "tiler_day_rate", productivityPerDay: "15" },
    ],
    wastePct: "5",
    markupPct: markup,
  }],
});

describe("trade skills versioning", () => {
  it("creates versions, activates explicitly, rolls back", async () => {
    const slug = `tiling_${Date.now()}`;
    const skill = await createSkill(slug, "أعمال البلاط");

    const v1 = await createSkillVersion(skill.id, content("15"), "الإصدار الأول");
    expect(v1.versionNumber).toBe(1);
    expect(await getActiveSkill(slug)).toBeNull(); // creation ≠ activation

    await activateSkillVersion(skill.id, v1.id);
    const active1 = await getActiveSkill(slug);
    expect(active1?.content.costModels[0].markupPct).toBe("15");

    const v2 = await createSkillVersion(skill.id, content("18"), "رفع هامش الربح");
    expect(v2.versionNumber).toBe(2);
    await activateSkillVersion(skill.id, v2.id);
    expect((await getActiveSkill(slug))?.versionNumber).toBe(2);

    // rollback = activate the older version
    await activateSkillVersion(skill.id, v1.id);
    expect((await getActiveSkill(slug))?.versionNumber).toBe(1);

    expect(await listSkillVersions(skill.id)).toHaveLength(2);
  });

  it("rejects direct mutation of a version's content (DB trigger)", async () => {
    const slug = `concrete_${Date.now()}`;
    const skill = await createSkill(slug, "أعمال الخرسانة");
    const v1 = await createSkillVersion(skill.id, { ...content("10"), trade: "concrete" }, "أول");
    const { error } = await testClient()
      .from("skill_versions")
      .update({ content: { hacked: true } })
      .eq("id", v1.id);
    expect(error).not.toBeNull();
  });

  it("rejects invalid content via zod", async () => {
    const skill = await createSkill(`bad_${Date.now()}`, "سيئ");
    await expect(
      createSkillVersion(skill.id, { trade: "x", costModels: [{ nope: true }] } as never, "سيئ"),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/db/skills.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement**

`src/lib/domain/skill-schema.ts`:
```ts
import { z } from "zod";

const decimalString = z.string().regex(/^\d+(\.\d{1,6})?$/, "قيمة عشرية غير صالحة");
const canonicalUnit = z.enum(["m3","m2","lm","ton","nr","ls","day","night","pc","hr","kg","pct"]);

export const CostComponentSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["material", "labor", "equipment"]),
  labelAr: z.string().min(1),
  priceBookKey: z.string().min(1),
  qtyPerUnit: decimalString.optional(),
  productivityPerDay: decimalString.optional(),
}).refine(
  (c) => (c.kind === "labor" ? !!c.productivityPerDay : !!c.qtyPerUnit),
  { message: "labor يتطلب productivityPerDay، وغيره يتطلب qtyPerUnit" },
);

export const CostModelSchema = z.object({
  id: z.string().min(1),
  labelAr: z.string().min(1),
  unit: canonicalUnit,
  keywords: z.array(z.string()),
  components: z.array(CostComponentSchema).min(1),
  wastePct: decimalString,
  markupPct: decimalString,
  band: z.object({ minRateFils: z.number().int().nonnegative(), maxRateFils: z.number().int().positive() }).optional(),
});

export const SkillContentSchema = z.object({
  trade: z.string().min(1),
  costModels: z.array(CostModelSchema),
});

export const ProfileContentSchema = z.object({
  trades: z.array(z.string().min(1)),
  ratioChecks: z.array(z.object({
    sectionMatch: z.string().min(1),
    minPct: z.number().min(0).max(100),
    maxPct: z.number().min(0).max(100),
    labelAr: z.string().min(1),
  })),
});

export type CostComponent = z.infer<typeof CostComponentSchema>;
export type CostModel = z.infer<typeof CostModelSchema>;
export type SkillContent = z.infer<typeof SkillContentSchema>;
export type ProfileContent = z.infer<typeof ProfileContentSchema>;
```

`src/lib/db/skills.ts`:
```ts
import { serviceClient } from "./client";
import {
  SkillContentSchema, ProfileContentSchema,
  type SkillContent, type ProfileContent,
} from "@/lib/domain/skill-schema";

export async function createSkill(slug: string, nameAr: string) {
  const { data, error } = await serviceClient()
    .from("trade_skills").insert({ slug, name_ar: nameAr }).select("id").single();
  if (error) throw error;
  return data;
}

export async function createSkillVersion(skillId: string, content: SkillContent, changelog: string) {
  const parsed = SkillContentSchema.parse(content);
  const { data: latest, error: qErr } = await serviceClient()
    .from("skill_versions").select("version_number, id")
    .eq("skill_id", skillId).order("version_number", { ascending: false }).limit(1);
  if (qErr) throw qErr;
  const versionNumber = (latest?.[0]?.version_number ?? 0) + 1;
  const { data, error } = await serviceClient()
    .from("skill_versions")
    .insert({
      skill_id: skillId, version_number: versionNumber, content: parsed,
      changelog, parent_version_id: latest?.[0]?.id ?? null,
    })
    .select("id").single();
  if (error) throw error;
  return { id: data.id, versionNumber };
}

export async function activateSkillVersion(skillId: string, versionId: string) {
  const { error } = await serviceClient()
    .from("trade_skills").update({ active_version_id: versionId }).eq("id", skillId);
  if (error) throw error;
}

export async function getActiveSkill(slug: string) {
  const { data, error } = await serviceClient()
    .from("trade_skills").select("active_version_id").eq("slug", slug).single();
  if (error) throw error;
  if (!data.active_version_id) return null;
  const { data: v, error: vErr } = await serviceClient()
    .from("skill_versions").select("id, version_number, content")
    .eq("id", data.active_version_id).single();
  if (vErr) throw vErr;
  return {
    content: SkillContentSchema.parse(v.content),
    versionId: v.id,
    versionNumber: v.version_number,
  };
}

export async function listSkillVersions(skillId: string) {
  const { data, error } = await serviceClient()
    .from("skill_versions").select("id, version_number, changelog, created_at")
    .eq("skill_id", skillId).order("version_number", { ascending: false });
  if (error) throw error;
  return data.map((r) => ({
    id: r.id, versionNumber: r.version_number,
    changelog: r.changelog, createdAt: r.created_at,
  }));
}

// Profiles: same pattern.
export async function createProfile(slug: string, nameAr: string) {
  const { data, error } = await serviceClient()
    .from("project_type_profiles").insert({ slug, name_ar: nameAr }).select("id").single();
  if (error) throw error;
  return data;
}

export async function createProfileVersion(profileId: string, content: ProfileContent, changelog: string) {
  const parsed = ProfileContentSchema.parse(content);
  const { data: latest, error: qErr } = await serviceClient()
    .from("profile_versions").select("version_number")
    .eq("profile_id", profileId).order("version_number", { ascending: false }).limit(1);
  if (qErr) throw qErr;
  const versionNumber = (latest?.[0]?.version_number ?? 0) + 1;
  const { data, error } = await serviceClient()
    .from("profile_versions")
    .insert({ profile_id: profileId, version_number: versionNumber, content: parsed, changelog })
    .select("id").single();
  if (error) throw error;
  return { id: data.id, versionNumber };
}

export async function activateProfileVersion(profileId: string, versionId: string) {
  const { error } = await serviceClient()
    .from("project_type_profiles").update({ active_version_id: versionId }).eq("id", profileId);
  if (error) throw error;
}

export async function getActiveProfile(slug: string) {
  const { data, error } = await serviceClient()
    .from("project_type_profiles").select("active_version_id").eq("slug", slug).single();
  if (error) throw error;
  if (!data.active_version_id) return null;
  const { data: v, error: vErr } = await serviceClient()
    .from("profile_versions").select("id, version_number, content")
    .eq("id", data.active_version_id).single();
  if (vErr) throw vErr;
  return {
    content: ProfileContentSchema.parse(v.content),
    versionId: v.id,
    versionNumber: v.version_number,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/db/skills.test.ts`
Expected: PASS (all 3)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations src/lib/db/skills.ts src/lib/domain/skill-schema.ts tests/db/skills.test.ts
git commit -m "feat: versioned trade skills + project-type profiles (immutable versions, explicit activation)"
```

---

### Task 7: Cost Engine

**Files:**
- Create: `src/lib/domain/cost-engine.ts`
- Modify: `src/lib/domain/types.ts` (add `RateBreakdown`)
- Test: `tests/domain/cost-engine.test.ts`

**Interfaces:**
- Consumes: `CostModel` (Task 6), `PriceSnapshot` (Task 5), `parseDecimalToMicro`/`roundDivHalfUp` (Task 2)
- Produces:
  - `type RateBreakdown = { materialFils: number; wasteFils: number; laborFils: number; equipmentFils: number; markupFils: number; rateFils: number; priceEntryIds: Record<string, string> }`
  - `evaluateCostModel(model: CostModel, snapshot: PriceSnapshot): RateBreakdown`
  - `class MissingPriceKeyError extends Error { key: string }`

- [ ] **Step 1: Write the failing test**

`tests/domain/cost-engine.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { evaluateCostModel, MissingPriceKeyError } from "@/lib/domain/cost-engine";
import type { CostModel } from "@/lib/domain/skill-schema";
import type { PriceSnapshot } from "@/lib/domain/types";

const tiling: CostModel = {
  id: "tiling.ceramic_floor",
  labelAr: "بلاط سيراميك أرضيات",
  unit: "m2",
  keywords: ["سيراميك"],
  components: [
    { id: "tile", kind: "material", labelAr: "بلاط", priceBookKey: "ceramic_tile_m2", qtyPerUnit: "1" },
    { id: "mortar", kind: "material", labelAr: "مونة", priceBookKey: "mortar_m2", qtyPerUnit: "1" },
    { id: "tiler", kind: "labor", labelAr: "مبلط", priceBookKey: "tiler_day_rate", productivityPerDay: "15" },
  ],
  wastePct: "5",
  markupPct: "15",
};

const snapshot: PriceSnapshot = {
  ceramic_tile_m2: { priceFils: 8000, entryId: "e1", effectiveDate: "2026-07-01", unit: "m2" },
  mortar_m2: { priceFils: 1500, entryId: "e2", effectiveDate: "2026-07-01", unit: "m2" },
  tiler_day_rate: { priceFils: 25000, entryId: "e3", effectiveDate: "2026-07-01", unit: "day" },
};

describe("evaluateCostModel", () => {
  it("prices ceramic tiling to the fils, deterministically", () => {
    const b = evaluateCostModel(tiling, snapshot);
    expect(b.materialFils).toBe(9500);          // 8000 + 1500
    expect(b.wasteFils).toBe(475);              // 5% of 9500
    expect(b.laborFils).toBe(1667);             // 25000 / 15 = 1666.67 → 1667
    expect(b.equipmentFils).toBe(0);
    expect(b.markupFils).toBe(1746);            // 15% of 11642 = 1746.3 → 1746
    expect(b.rateFils).toBe(13388);
    expect(b.priceEntryIds.ceramic_tile_m2).toBe("e1");
  });

  it("is exactly reproducible (same inputs, same output)", () => {
    expect(evaluateCostModel(tiling, snapshot)).toEqual(evaluateCostModel(tiling, snapshot));
  });

  it("throws MissingPriceKeyError for absent price keys", () => {
    expect(() => evaluateCostModel(tiling, { ...snapshot, tiler_day_rate: undefined as never }))
      .toThrow(MissingPriceKeyError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/cost-engine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

Append to `src/lib/domain/types.ts`:
```ts
export interface RateBreakdown {
  materialFils: number;
  wasteFils: number;
  laborFils: number;
  equipmentFils: number;
  markupFils: number;
  rateFils: number;
  priceEntryIds: Record<string, string>;
}
```

`src/lib/domain/cost-engine.ts`:
```ts
import type { CostModel } from "./skill-schema";
import type { PriceSnapshot, RateBreakdown } from "./types";
import { parseDecimalToMicro, roundDivHalfUp } from "./money";

export class MissingPriceKeyError extends Error {
  constructor(public key: string) {
    super(`مفتاح سعر مفقود في دفتر الأسعار: ${key}`);
  }
}

const MICRO = 1_000_000n;

export function evaluateCostModel(model: CostModel, snapshot: PriceSnapshot): RateBreakdown {
  let material = 0n, labor = 0n, equipment = 0n;
  const priceEntryIds: Record<string, string> = {};

  for (const c of model.components) {
    const entry = snapshot[c.priceBookKey];
    if (!entry) throw new MissingPriceKeyError(c.priceBookKey);
    priceEntryIds[c.priceBookKey] = entry.entryId;
    const price = BigInt(entry.priceFils);

    if (c.kind === "labor") {
      // cost per output unit = day rate ÷ productivity(units/day)
      const productivity = parseDecimalToMicro(c.productivityPerDay!);
      labor += roundDivHalfUp(price * MICRO, productivity);
    } else {
      const qty = parseDecimalToMicro(c.qtyPerUnit!);
      const cost = roundDivHalfUp(price * qty, MICRO);
      if (c.kind === "material") material += cost;
      else equipment += cost;
    }
  }

  const waste = roundDivHalfUp(material * parseDecimalToMicro(model.wastePct), 100n * MICRO);
  const base = material + waste + labor + equipment;
  const markup = roundDivHalfUp(base * parseDecimalToMicro(model.markupPct), 100n * MICRO);

  return {
    materialFils: Number(material),
    wasteFils: Number(waste),
    laborFils: Number(labor),
    equipmentFils: Number(equipment),
    markupFils: Number(markup),
    rateFils: Number(base + markup),
    priceEntryIds,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/cost-engine.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/cost-engine.ts src/lib/domain/types.ts tests/domain/cost-engine.test.ts
git commit -m "feat: deterministic cost engine (material+labor+equipment+waste+markup)"
```

---

### Task 8: Project Overrides

**Files:**
- Create: `src/lib/domain/overrides.ts`
- Test: `tests/domain/overrides.test.ts`

**Interfaces:**
- Consumes: `CostModel` (Task 6), `PriceSnapshot` (Task 5)
- Produces:
  - `type ProjectOverrides = { priceBook?: Record<string, number>; globalMarkupPct?: string; markupPctByTrade?: Record<string, string>; laborPremiumPct?: string; models?: Record<string, { wastePct?: string; markupPct?: string }> }`
  - `applyPriceOverrides(snapshot: PriceSnapshot, o?: ProjectOverrides): PriceSnapshot`
  - `applyModelOverrides(model: CostModel, trade: string, o?: ProjectOverrides): CostModel`
  - `applyLaborPremium(breakdown: RateBreakdown, o?: ProjectOverrides): RateBreakdown` — scales `laborFils`, recomputes markup + rate (uses same rounding as engine)

Precedence (most specific wins): `models[modelId].markupPct` > `markupPctByTrade[trade]` > `globalMarkupPct` > model default.

- [ ] **Step 1: Write the failing test**

`tests/domain/overrides.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { applyPriceOverrides, applyModelOverrides } from "@/lib/domain/overrides";
import type { CostModel } from "@/lib/domain/skill-schema";
import type { PriceSnapshot } from "@/lib/domain/types";

const model: CostModel = {
  id: "tiling.ceramic_floor", labelAr: "بلاط", unit: "m2", keywords: [],
  components: [{ id: "tile", kind: "material", labelAr: "بلاط", priceBookKey: "ceramic_tile_m2", qtyPerUnit: "1" }],
  wastePct: "5", markupPct: "15",
};

const snapshot: PriceSnapshot = {
  ceramic_tile_m2: { priceFils: 8000, entryId: "e1", effectiveDate: "2026-07-01", unit: "m2" },
};

describe("overrides", () => {
  it("overrides price book entries per project", () => {
    const out = applyPriceOverrides(snapshot, { priceBook: { ceramic_tile_m2: 9000 } });
    expect(out.ceramic_tile_m2.priceFils).toBe(9000);
    expect(snapshot.ceramic_tile_m2.priceFils).toBe(8000); // original untouched
  });

  it("respects markup precedence: model > trade > global > default", () => {
    expect(applyModelOverrides(model, "tiling", {}).markupPct).toBe("15");
    expect(applyModelOverrides(model, "tiling", { globalMarkupPct: "12" }).markupPct).toBe("12");
    expect(applyModelOverrides(model, "tiling", {
      globalMarkupPct: "12", markupPctByTrade: { tiling: "18" },
    }).markupPct).toBe("18");
    expect(applyModelOverrides(model, "tiling", {
      globalMarkupPct: "12", markupPctByTrade: { tiling: "18" },
      models: { "tiling.ceramic_floor": { markupPct: "20" } },
    }).markupPct).toBe("20");
  });

  it("returns inputs unchanged when no overrides given", () => {
    expect(applyModelOverrides(model, "tiling", undefined)).toEqual(model);
    expect(applyPriceOverrides(snapshot, undefined)).toEqual(snapshot);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/overrides.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/lib/domain/overrides.ts`**

```ts
import type { CostModel } from "./skill-schema";
import type { PriceSnapshot, RateBreakdown } from "./types";
import { parseDecimalToMicro, roundDivHalfUp } from "./money";

export interface ProjectOverrides {
  priceBook?: Record<string, number>;
  globalMarkupPct?: string;
  markupPctByTrade?: Record<string, string>;
  laborPremiumPct?: string;
  models?: Record<string, { wastePct?: string; markupPct?: string }>;
}

export function applyPriceOverrides(snapshot: PriceSnapshot, o?: ProjectOverrides): PriceSnapshot {
  if (!o?.priceBook) return snapshot;
  const out: PriceSnapshot = { ...snapshot };
  for (const [key, priceFils] of Object.entries(o.priceBook)) {
    if (out[key]) out[key] = { ...out[key], priceFils };
  }
  return out;
}

export function applyModelOverrides(model: CostModel, trade: string, o?: ProjectOverrides): CostModel {
  if (!o) return model;
  const m = o.models?.[model.id];
  const markupPct =
    m?.markupPct ?? o.markupPctByTrade?.[trade] ?? o.globalMarkupPct ?? model.markupPct;
  const wastePct = m?.wastePct ?? model.wastePct;
  if (markupPct === model.markupPct && wastePct === model.wastePct) return model;
  return { ...model, markupPct, wastePct };
}

export function applyLaborPremium(b: RateBreakdown, o?: ProjectOverrides): RateBreakdown {
  if (!o?.laborPremiumPct) return b;
  const premium = Number(
    roundDivHalfUp(BigInt(b.laborFils) * parseDecimalToMicro(o.laborPremiumPct), 100n * 1_000_000n),
  );
  const labor = b.laborFils + premium;
  // markup was computed on the pre-premium base; recompute proportionally is NOT possible
  // without the pct — so callers must apply labor premium BEFORE markup. This function
  // exists for the orchestrator, which passes markupPct explicitly:
  throw new Error("استخدم evaluateWithOverrides في price-quote.ts بدلاً من هذه الدالة مباشرة");
}
```

**Design note discovered while writing this:** labor premium must be applied *before* markup is computed, so it can't be a post-hoc adjustment on `RateBreakdown`. Delete `applyLaborPremium` from this file and instead have the Task 10 orchestrator inject the premium into the component list: a labor premium of `"20"` multiplies each labor component's effective day-rate via `applyPriceOverrides`-style scaling. Implement it as:

```ts
export function applyLaborPremiumToSnapshot(
  snapshot: PriceSnapshot,
  laborKeys: string[],
  o?: ProjectOverrides,
): PriceSnapshot {
  if (!o?.laborPremiumPct) return snapshot;
  const factor = parseDecimalToMicro(o.laborPremiumPct);
  const out: PriceSnapshot = { ...snapshot };
  for (const key of laborKeys) {
    if (!out[key]) continue;
    const premium = Number(roundDivHalfUp(BigInt(out[key].priceFils) * factor, 100n * 1_000_000n));
    out[key] = { ...out[key], priceFils: out[key].priceFils + premium };
  }
  return out;
}
```

(`laborKeys` = the `priceBookKey`s of components with `kind === 'labor'` — the orchestrator collects them.) Add a test:

```ts
it("applies labor premium to labor price-book keys only", () => {
  const snap: PriceSnapshot = {
    tiler_day_rate: { priceFils: 25000, entryId: "e3", effectiveDate: "2026-07-01", unit: "day" },
    ceramic_tile_m2: { priceFils: 8000, entryId: "e1", effectiveDate: "2026-07-01", unit: "m2" },
  };
  const out = applyLaborPremiumToSnapshot(snap, ["tiler_day_rate"], { laborPremiumPct: "20" });
  expect(out.tiler_day_rate.priceFils).toBe(30000);
  expect(out.ceramic_tile_m2.priceFils).toBe(8000);
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/domain/overrides.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/overrides.ts tests/domain/overrides.test.ts
git commit -m "feat: per-project overrides (price book, markup precedence, labor premium)"
```

---

### Task 9: Rollup Engine

**Files:**
- Create: `src/lib/domain/rollup.ts`
- Test: `tests/domain/rollup.test.ts`

**Interfaces:**
- Consumes: `lineAmountFils`, `sumFils` (Task 2)
- Produces:
  - `type RollupInput = { sectionRef: string; amountFils: number | null }`
  - `type QuoteRollup = { sections: Array<{ sectionRef: string; totalFils: number; itemCount: number; unpricedCount: number }>; grandTotalFils: number }`
  - `buildRollup(lines: RollupInput[]): QuoteRollup` (sections ordered by first appearance)
  - `verifyRollup(computed: QuoteRollup, reported: { sectionTotals?: Record<string, number>; grandTotalFils?: number }): Array<{ code: 'ROLLUP_MISMATCH'; severity: 'error'; messageAr: string; detail: unknown }>`

- [ ] **Step 1: Write the failing test**

`tests/domain/rollup.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildRollup, verifyRollup } from "@/lib/domain/rollup";

const lines = [
  { sectionRef: "1", amountFils: 100_000 },
  { sectionRef: "1", amountFils: 50_000 },
  { sectionRef: "2", amountFils: 200_000 },
  { sectionRef: "2", amountFils: null },     // unpriced item
];

describe("buildRollup", () => {
  it("totals per section (ordered by first appearance) and grand total", () => {
    const r = buildRollup(lines);
    expect(r.sections).toEqual([
      { sectionRef: "1", totalFils: 150_000, itemCount: 2, unpricedCount: 0 },
      { sectionRef: "2", totalFils: 200_000, itemCount: 2, unpricedCount: 1 },
    ]);
    expect(r.grandTotalFils).toBe(350_000);
  });
});

describe("verifyRollup", () => {
  it("passes when reported totals reconcile to the fils", () => {
    const r = buildRollup(lines);
    expect(verifyRollup(r, { sectionTotals: { "1": 150_000, "2": 200_000 }, grandTotalFils: 350_000 })).toEqual([]);
  });
  it("flags any discrepancy", () => {
    const r = buildRollup(lines);
    const flags = verifyRollup(r, { sectionTotals: { "1": 150_001 }, grandTotalFils: 350_000 });
    expect(flags).toHaveLength(1);
    expect(flags[0].code).toBe("ROLLUP_MISMATCH");
    expect(flags[0].detail).toMatchObject({ sectionRef: "1", computed: 150_000, reported: 150_001 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/rollup.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/lib/domain/rollup.ts`**

```ts
export interface RollupInput { sectionRef: string; amountFils: number | null }

export interface QuoteRollup {
  sections: Array<{ sectionRef: string; totalFils: number; itemCount: number; unpricedCount: number }>;
  grandTotalFils: number;
}

export interface RollupFlag {
  code: "ROLLUP_MISMATCH";
  severity: "error";
  messageAr: string;
  detail: unknown;
}

export function buildRollup(lines: RollupInput[]): QuoteRollup {
  const order: string[] = [];
  const bySection = new Map<string, { totalFils: number; itemCount: number; unpricedCount: number }>();
  for (const line of lines) {
    if (!bySection.has(line.sectionRef)) {
      bySection.set(line.sectionRef, { totalFils: 0, itemCount: 0, unpricedCount: 0 });
      order.push(line.sectionRef);
    }
    const s = bySection.get(line.sectionRef)!;
    s.itemCount += 1;
    if (line.amountFils === null) s.unpricedCount += 1;
    else s.totalFils += line.amountFils;
  }
  const sections = order.map((sectionRef) => ({ sectionRef, ...bySection.get(sectionRef)! }));
  return { sections, grandTotalFils: sections.reduce((a, s) => a + s.totalFils, 0) };
}

export function verifyRollup(
  computed: QuoteRollup,
  reported: { sectionTotals?: Record<string, number>; grandTotalFils?: number },
): RollupFlag[] {
  const flags: RollupFlag[] = [];
  for (const [sectionRef, reportedTotal] of Object.entries(reported.sectionTotals ?? {})) {
    const section = computed.sections.find((s) => s.sectionRef === sectionRef);
    const computedTotal = section?.totalFils ?? 0;
    if (computedTotal !== reportedTotal) {
      flags.push({
        code: "ROLLUP_MISMATCH", severity: "error",
        messageAr: `مجموع القسم ${sectionRef} لا يتطابق مع المجموع المرحّل`,
        detail: { sectionRef, computed: computedTotal, reported: reportedTotal },
      });
    }
  }
  if (reported.grandTotalFils !== undefined && reported.grandTotalFils !== computed.grandTotalFils) {
    flags.push({
      code: "ROLLUP_MISMATCH", severity: "error",
      messageAr: "المجموع الكلي لا يتطابق مع الخلاصة",
      detail: { computed: computed.grandTotalFils, reported: reported.grandTotalFils },
    });
  }
  return flags;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/rollup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/rollup.ts tests/domain/rollup.test.ts
git commit -m "feat: rollup engine with carried-forward reconciliation"
```

---

### Task 10: Validation + `priceQuote` Orchestrator

**Files:**
- Create: `src/lib/domain/validation.ts`, `src/lib/domain/price-quote.ts`
- Modify: `src/lib/domain/types.ts` (add `Flag`, `FlagCode`)
- Test: `tests/domain/validation.test.ts`, `tests/domain/price-quote.test.ts`

**Interfaces:**
- Consumes: everything above — `evaluateCostModel` (7), overrides (8), `buildRollup` (9), `lineAmountFils` (2), `SkillContent` (6), `PriceSnapshot` (5), `CanonicalUnit` (3)
- Produces:
  - `type FlagCode = 'UNIT_MISMATCH'|'UNIT_UNKNOWN'|'OUT_OF_BAND'|'NO_MATCH'|'SEMANTIC_FALLBACK'|'QTY_CHECKSUM_FAIL'|'MISSING_PRICE_KEY'|'ROLLUP_MISMATCH'|'RATIO_WARNING'|'NEEDS_MANUAL'`
  - `type Flag = { code: FlagCode; severity: 'error'|'warning'; messageAr: string; detail?: unknown }`
  - `type MatchedItem = { id: string; sectionRef: string; itemType: ItemType; unitCanonical: CanonicalUnit | null; quantityThousandths: number | null; givenAmountFils?: number; match: { trade: string; costModelId: string; method: 'deterministic'|'semantic'; confidence: number } | null }`
  - `type PricedLine = { id: string; rateFils: number | null; amountFils: number | null; breakdown: RateBreakdown | null; flags: Flag[]; provenance: { skillVersionId?: string; method?: string; priceEntryIds?: Record<string, string> } }`
  - `priceQuote(input: { items: MatchedItem[]; skills: Record<string, { content: SkillContent; versionId: string }>; snapshot: PriceSnapshot; overrides?: ProjectOverrides; ratioChecks?: ProfileContent['ratioChecks'] }): { lines: PricedLine[]; rollup: QuoteRollup; projectFlags: Flag[] }`

Behavior rules (encode all in tests):
1. `item_type ≠ 'unit_rate'`: `provisional_sum`/`lump_sum` with `givenAmountFils` pass through (provenance `method: 'given'`); without it → `NEEDS_MANUAL` (error). `dayworks`/`percentage` → always `NEEDS_MANUAL`.
2. `match === null` → `NO_MATCH` (error), unpriced.
3. Unknown unit (`unitCanonical === null`) → `UNIT_UNKNOWN` (error), unpriced.
4. Item unit ≠ model unit → `UNIT_MISMATCH` (error), unpriced — hard stop, never auto-priced.
5. `MissingPriceKeyError` from engine → `MISSING_PRICE_KEY` (error), unpriced — degrade, never throw out of `priceQuote`.
6. `method === 'semantic'` → price it but add `SEMANTIC_FALLBACK` (warning).
7. Rate outside model band → `OUT_OF_BAND` (warning).
8. Ratio checks: for each `ratioCheck`, section total ÷ grand total outside `[minPct, maxPct]` → project-level `RATIO_WARNING`.
9. Labor premium override: collect labor `priceBookKey`s from all active models, apply `applyLaborPremiumToSnapshot` before evaluation; price + model overrides likewise applied before evaluation.

- [ ] **Step 1: Write failing validation tests**

`tests/domain/validation.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateUnit, validateBand, checkRatios } from "@/lib/domain/validation";
import { buildRollup } from "@/lib/domain/rollup";

describe("validateUnit", () => {
  it("flags unknown item unit", () => {
    expect(validateUnit(null, "m2")[0].code).toBe("UNIT_UNKNOWN");
  });
  it("flags item/model unit mismatch as error", () => {
    const flags = validateUnit("m3", "m2");
    expect(flags[0].code).toBe("UNIT_MISMATCH");
    expect(flags[0].severity).toBe("error");
  });
  it("passes matching units", () => {
    expect(validateUnit("m2", "m2")).toEqual([]);
  });
});

describe("validateBand", () => {
  it("flags out-of-band rates as warning", () => {
    const flags = validateBand(20_000, { minRateFils: 8_000, maxRateFils: 18_000 });
    expect(flags[0].code).toBe("OUT_OF_BAND");
    expect(flags[0].severity).toBe("warning");
  });
  it("passes in-band and missing band", () => {
    expect(validateBand(13_388, { minRateFils: 8_000, maxRateFils: 18_000 })).toEqual([]);
    expect(validateBand(999_999, undefined)).toEqual([]);
  });
});

describe("checkRatios", () => {
  it("warns when a section's share of grand total is out of expected range", () => {
    const rollup = buildRollup([
      { sectionRef: "2", amountFils: 900_000 },  // 90% — concrete way too dominant
      { sectionRef: "5", amountFils: 100_000 },
    ]);
    const flags = checkRatios(rollup, [
      { sectionMatch: "2", minPct: 20, maxPct: 45, labelAr: "الأعمال الخرسانية" },
    ]);
    expect(flags[0].code).toBe("RATIO_WARNING");
  });
});
```

- [ ] **Step 2: Run to verify failure, implement `src/lib/domain/validation.ts`**

Append to `src/lib/domain/types.ts`:
```ts
export type FlagCode =
  | "UNIT_MISMATCH" | "UNIT_UNKNOWN" | "OUT_OF_BAND" | "NO_MATCH"
  | "SEMANTIC_FALLBACK" | "QTY_CHECKSUM_FAIL" | "MISSING_PRICE_KEY"
  | "ROLLUP_MISMATCH" | "RATIO_WARNING" | "NEEDS_MANUAL";

export interface Flag {
  code: FlagCode;
  severity: "error" | "warning";
  messageAr: string;
  detail?: unknown;
}
```

`src/lib/domain/validation.ts`:
```ts
import type { CanonicalUnit, Flag } from "./types";
import type { QuoteRollup } from "./rollup";

export function validateUnit(itemUnit: CanonicalUnit | null, modelUnit: CanonicalUnit): Flag[] {
  if (itemUnit === null) {
    return [{ code: "UNIT_UNKNOWN", severity: "error", messageAr: "وحدة القياس غير معروفة" }];
  }
  if (itemUnit !== modelUnit) {
    return [{
      code: "UNIT_MISMATCH", severity: "error",
      messageAr: `وحدة البند (${itemUnit}) لا تطابق وحدة نموذج التسعير (${modelUnit})`,
      detail: { itemUnit, modelUnit },
    }];
  }
  return [];
}

export function validateBand(
  rateFils: number,
  band?: { minRateFils: number; maxRateFils: number },
): Flag[] {
  if (!band) return [];
  if (rateFils < band.minRateFils || rateFils > band.maxRateFils) {
    return [{
      code: "OUT_OF_BAND", severity: "warning",
      messageAr: "السعر المحسوب خارج النطاق المعقول لهذا البند",
      detail: { rateFils, ...band },
    }];
  }
  return [];
}

export function checkRatios(
  rollup: QuoteRollup,
  checks: Array<{ sectionMatch: string; minPct: number; maxPct: number; labelAr: string }>,
): Flag[] {
  if (rollup.grandTotalFils === 0) return [];
  const flags: Flag[] = [];
  for (const check of checks) {
    const total = rollup.sections
      .filter((s) => s.sectionRef === check.sectionMatch || s.sectionRef.startsWith(`${check.sectionMatch}/`))
      .reduce((a, s) => a + s.totalFils, 0);
    const pct = (total / rollup.grandTotalFils) * 100;
    if (pct < check.minPct || pct > check.maxPct) {
      flags.push({
        code: "RATIO_WARNING", severity: "warning",
        messageAr: `نسبة ${check.labelAr} من الإجمالي (${pct.toFixed(1)}٪) خارج النطاق المتوقع`,
        detail: { sectionMatch: check.sectionMatch, pct, minPct: check.minPct, maxPct: check.maxPct },
      });
    }
  }
  return flags;
}
```

Run: `npm test -- tests/domain/validation.test.ts`
Expected: PASS

- [ ] **Step 3: Write failing orchestrator test**

`tests/domain/price-quote.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { priceQuote } from "@/lib/domain/price-quote";
import type { SkillContent } from "@/lib/domain/skill-schema";
import type { PriceSnapshot } from "@/lib/domain/types";

const tilingSkill: SkillContent = {
  trade: "tiling",
  costModels: [{
    id: "tiling.ceramic_floor", labelAr: "بلاط سيراميك", unit: "m2", keywords: [],
    components: [
      { id: "tile", kind: "material", labelAr: "بلاط", priceBookKey: "ceramic_tile_m2", qtyPerUnit: "1" },
      { id: "mortar", kind: "material", labelAr: "مونة", priceBookKey: "mortar_m2", qtyPerUnit: "1" },
      { id: "tiler", kind: "labor", labelAr: "مبلط", priceBookKey: "tiler_day_rate", productivityPerDay: "15" },
    ],
    wastePct: "5", markupPct: "15",
    band: { minRateFils: 8_000, maxRateFils: 18_000 },
  }],
};

const snapshot: PriceSnapshot = {
  ceramic_tile_m2: { priceFils: 8000, entryId: "e1", effectiveDate: "2026-07-01", unit: "m2" },
  mortar_m2: { priceFils: 1500, entryId: "e2", effectiveDate: "2026-07-01", unit: "m2" },
  tiler_day_rate: { priceFils: 25000, entryId: "e3", effectiveDate: "2026-07-01", unit: "day" },
};

const skills = { tiling: { content: tilingSkill, versionId: "sv1" } };
const match = { trade: "tiling", costModelId: "tiling.ceramic_floor", method: "deterministic" as const, confidence: 0.95 };

describe("priceQuote", () => {
  it("prices a clean deterministic match with full provenance, no flags", () => {
    const { lines, rollup } = priceQuote({
      items: [{ id: "i1", sectionRef: "5", itemType: "unit_rate", unitCanonical: "m2", quantityThousandths: 2_700_000, match }],
      skills, snapshot,
    });
    expect(lines[0].rateFils).toBe(13_388);
    expect(lines[0].amountFils).toBe(36_147_600);   // 2700 × 13.388
    expect(lines[0].flags).toEqual([]);
    expect(lines[0].provenance.skillVersionId).toBe("sv1");
    expect(rollup.grandTotalFils).toBe(36_147_600);
  });

  it("adds SEMANTIC_FALLBACK warning for semantic matches (still priced)", () => {
    const { lines } = priceQuote({
      items: [{ id: "i1", sectionRef: "5", itemType: "unit_rate", unitCanonical: "m2", quantityThousandths: 1_000, match: { ...match, method: "semantic" } }],
      skills, snapshot,
    });
    expect(lines[0].rateFils).toBe(13_388);
    expect(lines[0].flags.map((f) => f.code)).toContain("SEMANTIC_FALLBACK");
  });

  it("hard-stops unit mismatch: no price, error flag", () => {
    const { lines } = priceQuote({
      items: [{ id: "i1", sectionRef: "5", itemType: "unit_rate", unitCanonical: "m3", quantityThousandths: 1_000, match }],
      skills, snapshot,
    });
    expect(lines[0].rateFils).toBeNull();
    expect(lines[0].flags.map((f) => f.code)).toContain("UNIT_MISMATCH");
  });

  it("degrades missing price key to a flag, never throws", () => {
    const { lines } = priceQuote({
      items: [{ id: "i1", sectionRef: "5", itemType: "unit_rate", unitCanonical: "m2", quantityThousandths: 1_000, match }],
      skills,
      snapshot: { ceramic_tile_m2: snapshot.ceramic_tile_m2, mortar_m2: snapshot.mortar_m2 } as PriceSnapshot,
    });
    expect(lines[0].rateFils).toBeNull();
    expect(lines[0].flags.map((f) => f.code)).toContain("MISSING_PRICE_KEY");
  });

  it("passes provisional sums through with given amounts; flags dayworks as manual", () => {
    const { lines } = priceQuote({
      items: [
        { id: "ps", sectionRef: "PS", itemType: "provisional_sum", unitCanonical: "ls", quantityThousandths: null, givenAmountFils: 402_600_000, match: null },
        { id: "dw", sectionRef: "DW", itemType: "dayworks", unitCanonical: "day", quantityThousandths: null, match: null },
      ],
      skills, snapshot,
    });
    expect(lines[0].amountFils).toBe(402_600_000);
    expect(lines[0].flags).toEqual([]);
    expect(lines[1].amountFils).toBeNull();
    expect(lines[1].flags.map((f) => f.code)).toContain("NEEDS_MANUAL");
  });

  it("applies overrides before pricing (markup + labor premium)", () => {
    const { lines } = priceQuote({
      items: [{ id: "i1", sectionRef: "5", itemType: "unit_rate", unitCanonical: "m2", quantityThousandths: 1_000, match }],
      skills, snapshot,
      overrides: { markupPctByTrade: { tiling: "20" }, laborPremiumPct: "20" },
    });
    // labor premium: tiler 25000 → 30000; labor 30000/15 = 2000
    // base = 9500 + 475 + 2000 = 11975; markup 20% = 2395; rate = 14370
    expect(lines[0].rateFils).toBe(14_370);
  });

  it("emits project-level ratio warnings", () => {
    const { projectFlags } = priceQuote({
      items: [{ id: "i1", sectionRef: "5", itemType: "unit_rate", unitCanonical: "m2", quantityThousandths: 2_700_000, match }],
      skills, snapshot,
      ratioChecks: [{ sectionMatch: "5", minPct: 1, maxPct: 30, labelAr: "أعمال البلاط" }],
    });
    expect(projectFlags.map((f) => f.code)).toContain("RATIO_WARNING"); // 100% > 30%
  });
});
```

- [ ] **Step 4: Run to verify failure, implement `src/lib/domain/price-quote.ts`**

```ts
import type { ProfileContent, SkillContent } from "./skill-schema";
import type { CanonicalUnit, Flag, PriceSnapshot, RateBreakdown } from "./types";
import { evaluateCostModel, MissingPriceKeyError } from "./cost-engine";
import { applyModelOverrides, applyPriceOverrides, applyLaborPremiumToSnapshot, type ProjectOverrides } from "./overrides";
import { buildRollup, type QuoteRollup } from "./rollup";
import { validateBand, validateUnit, checkRatios } from "./validation";
import { lineAmountFils } from "./money";

export type ItemType = "unit_rate" | "provisional_sum" | "dayworks" | "lump_sum" | "percentage";

export interface MatchedItem {
  id: string;
  sectionRef: string;
  itemType: ItemType;
  unitCanonical: CanonicalUnit | null;
  quantityThousandths: number | null;
  givenAmountFils?: number;
  match: { trade: string; costModelId: string; method: "deterministic" | "semantic"; confidence: number } | null;
}

export interface PricedLine {
  id: string;
  rateFils: number | null;
  amountFils: number | null;
  breakdown: RateBreakdown | null;
  flags: Flag[];
  provenance: { skillVersionId?: string; method?: string; priceEntryIds?: Record<string, string> };
}

export function priceQuote(input: {
  items: MatchedItem[];
  skills: Record<string, { content: SkillContent; versionId: string }>;
  snapshot: PriceSnapshot;
  overrides?: ProjectOverrides;
  ratioChecks?: ProfileContent["ratioChecks"];
}): { lines: PricedLine[]; rollup: QuoteRollup; projectFlags: Flag[] } {
  const laborKeys = Object.values(input.skills).flatMap((s) =>
    s.content.costModels.flatMap((m) =>
      m.components.filter((c) => c.kind === "labor").map((c) => c.priceBookKey),
    ),
  );
  const snapshot = applyLaborPremiumToSnapshot(
    applyPriceOverrides(input.snapshot, input.overrides),
    laborKeys,
    input.overrides,
  );

  const lines = input.items.map((item): PricedLine => {
    // Non-unit-rate item types never reach rate matching.
    if (item.itemType !== "unit_rate") {
      if ((item.itemType === "provisional_sum" || item.itemType === "lump_sum") && item.givenAmountFils !== undefined) {
        return {
          id: item.id, rateFils: null, amountFils: item.givenAmountFils,
          breakdown: null, flags: [], provenance: { method: "given" },
        };
      }
      return unpriced(item, [{
        code: "NEEDS_MANUAL", severity: "error",
        messageAr: "هذا البند يتطلب تسعيراً يدوياً من المهندس",
        detail: { itemType: item.itemType },
      }]);
    }

    if (!item.match) {
      return unpriced(item, [{ code: "NO_MATCH", severity: "error", messageAr: "لم يتم العثور على نموذج تسعير مطابق" }]);
    }

    const skill = input.skills[item.match.trade];
    const baseModel = skill?.content.costModels.find((m) => m.id === item.match!.costModelId);
    if (!skill || !baseModel) {
      return unpriced(item, [{
        code: "NO_MATCH", severity: "error",
        messageAr: "نموذج التسعير المُطابق غير موجود في المهارة",
        detail: item.match,
      }]);
    }

    const unitFlags = validateUnit(item.unitCanonical, baseModel.unit);
    if (unitFlags.length > 0) return unpriced(item, unitFlags);

    const model = applyModelOverrides(baseModel, item.match.trade, input.overrides);

    let breakdown: RateBreakdown;
    try {
      breakdown = evaluateCostModel(model, snapshot);
    } catch (e) {
      if (e instanceof MissingPriceKeyError) {
        return unpriced(item, [{
          code: "MISSING_PRICE_KEY", severity: "error",
          messageAr: e.message, detail: { key: e.key },
        }]);
      }
      throw e;
    }

    const flags: Flag[] = [
      ...validateBand(breakdown.rateFils, model.band),
      ...(item.match.method === "semantic"
        ? [{
            code: "SEMANTIC_FALLBACK" as const, severity: "warning" as const,
            messageAr: "تمت المطابقة دلالياً — يُنصح بمراجعة المهندس",
            detail: { confidence: item.match.confidence },
          }]
        : []),
    ];

    const amountFils = item.quantityThousandths === null
      ? null
      : lineAmountFils(item.quantityThousandths, breakdown.rateFils);

    return {
      id: item.id,
      rateFils: breakdown.rateFils,
      amountFils,
      breakdown,
      flags,
      provenance: {
        skillVersionId: skill.versionId,
        method: item.match.method,
        priceEntryIds: breakdown.priceEntryIds,
      },
    };
  });

  const rollup = buildRollup(
    input.items.map((item, i) => ({ sectionRef: item.sectionRef, amountFils: lines[i].amountFils })),
  );
  const projectFlags = checkRatios(rollup, input.ratioChecks ?? []);

  return { lines, rollup, projectFlags };
}

function unpriced(item: MatchedItem, flags: Flag[]): PricedLine {
  return { id: item.id, rateFils: null, amountFils: null, breakdown: null, flags, provenance: {} };
}
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: ALL tests pass (Tasks 1–10)

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain tests/domain
git commit -m "feat: validation flags + priceQuote orchestrator — Phase 1 domain core complete"
```

---

## Self-Review Notes

- Every spec §5 pipeline stage that belongs to Phase 1 (price computation, validation, rollup, overrides, provenance) has a task; ingestion/tagging/matching stages are Phase 2 by design (they feed `MatchedItem` into `priceQuote`).
- Spec §7 verification items covered here: deterministic math (T2/T7), unit hard stops (T10), plausibility bands (T10), item-type gating consumption (T10 rule 1), rollup reconciliation (T9), provenance + pinning fields (T4 schema, T10 provenance). Dual-notation checksum and two-pass extraction are Phase 2 (ingestion-side) — `QTY_CHECKSUM_FAIL` flag code reserved here.
- Type consistency verified: `CostModel`/`SkillContent` (T6) consumed by T7/T10; `PriceSnapshot` (T5) consumed by T7/T8/T10; `Flag` shape identical in T9's `RollupFlag` and T10's `Flag`.
