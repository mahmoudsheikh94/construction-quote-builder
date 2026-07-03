# Phase 3: Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** An Arabic RTL web app (Vercel-deployable) where an engineer logs in to view/correct priced quotes and edit the rate library (price book + cost models per trade, versioned), backed by a shared Supabase; the local pipeline persists priced quotes to that DB.

**Architecture:** Next.js 16 App Router. `@supabase/ssr` for cookie-based auth (browser + server client factories, `proxy.ts` session refresh). UI DB access runs as the logged-in user (RLS-enforced) via server actions that wrap the existing `src/lib/db/` repos. The service-role client (`src/lib/db/client.ts`) stays for the local pipeline ONLY. Reuses all of `lib/domain/`, `lib/db/`, `lib/export/` unchanged.

**Tech Stack:** Next.js 16.2, React 19, `@supabase/ssr` ^0.12, `@supabase/supabase-js` ^2.49, Tailwind 4, Vitest. Money via existing `filsToJDString`/`parseJDToFils` (no float math in UI).

## Global Constraints

- **Arabic-first, RTL.** `<html lang="ar" dir="rtl">` (already set). Every screen RTL; labels Arabic.
- **Money = integer fils.** Rates entered as JD strings, parsed with `parseJDToFils`, displayed with `filsToJDString`. Never float-math money in the browser.
- **RLS enforced for UI.** UI reads/writes run as the `authenticated` user via the SSR client. `anon` is denied on all app tables. The `service_role` key is NEVER shipped to the browser (only `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` are public).
- **Versioning on explicit save.** A trade edit creates+activates a new immutable skill version only when the engineer clicks Save (not per keystroke), via existing `createSkillVersion` + `activateSkillVersion`.
- **Reuse, don't reimplement.** Server actions are thin wrappers over `src/lib/db/` repos + `src/lib/domain/`. No pricing logic in the UI.
- **Pipeline stays local/CLI.** The Vercel app never shells the CLI. `saveQuote` (new) lets the local pipeline write quotes to the shared DB.
- TDD for server actions + repo additions + RLS; commit per task. All existing 106 tests stay green.

## Environment (both local dev and later cloud)

`.env.local` needs, in addition to the existing service-role vars:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from `npx supabase status`>
```
(The anon key is separate from the service-role key. Get it from `npx supabase status` — the "anon key" line. Task 1 does this.)

## Existing interfaces this phase consumes (verbatim)

```ts
// src/lib/db/quotes.ts
createProject({name, projectType?, description?}) -> {id}
createQuote(projectId) -> {id}
insertLineItems(quoteId, NewLineItem[]) -> void
getQuoteItems(quoteId) -> LineItemRow[]   // ordered by sort_order
interface NewLineItem { sortOrder; itemCode?; sectionRef; descriptionOriginal; unitRaw?; unitCanonical?; quantityThousandths?; itemType? }
interface LineItemRow { id; quote_id; sort_order; item_code; section_ref; description_original; unit_raw; unit_canonical; quantity_thousandths; item_type; rate_fils; amount_fils; flags }
// src/lib/db/price-book.ts
addPriceEntry({key, labelAr, unit, priceFils, effectiveDate?}) -> {id}
getSnapshot(asOf?) -> PriceSnapshot   // latest per key
getHistory(key) -> {priceFils, effectiveDate}[]
// src/lib/db/skills.ts
createSkill(slug, nameAr) -> {id} ; createSkillVersion(skillId, content, changelog) -> {id, versionNumber}
activateSkillVersion(skillId, versionId) -> void ; getActiveSkill(slug) -> {content, versionId, versionNumber} | null
listSkillVersions(skillId) -> {id, versionNumber, changelog, createdAt}[]
// src/lib/domain
filsToJDString(fils) -> "12.345" ; parseJDToFils("12.345") -> fils
type SkillContent = { trade; costModels: CostModel[] }
type CostModel = { id; labelAr; unit; keywords[]; components[]; wastePct; markupPct; band? }
```

## File Map (new)

```
src/lib/supabase/
  browser.ts      # createBrowserClient factory (client components)
  server.ts       # createServerClient factory (server comps/actions, cookies)
proxy.ts          # (repo root) Next 16 middleware — session refresh + route gate
src/lib/db/
  quotes.ts       # + saveQuote(), listQuotes(), getQuote()
  corrections.ts  # NEW — corrections log repo
  skills.ts       # + listSkills()
src/app/
  login/page.tsx + actions.ts
  (app)/layout.tsx                  # authed shell (nav, sign-out)
  (app)/page.tsx                    # dashboard
  (app)/quotes/page.tsx             # quotes list
  (app)/quotes/[id]/page.tsx + actions.ts + QuoteTable.tsx + CorrectionDialog.tsx
  (app)/trades/page.tsx
  (app)/trades/[slug]/page.tsx + actions.ts + TradeEditor.tsx + VersionHistory.tsx
  (app)/price-book/page.tsx + actions.ts + PriceBookTable.tsx
supabase/migrations/  # + rls_policies, + corrections table, + quotes-name column
DEPLOY.md             # cloud Supabase + Vercel checklist (for Mahmoud)
```

---

### Task 1: Supabase SSR clients + env

**Files:**
- Create: `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`
- Modify: `.env.local` (add anon vars), `package.json` (add `@supabase/ssr`)
- Test: `tests/supabase/clients.test.ts`

**Interfaces:**
- Produces:
  - `createClient()` in `browser.ts` — a browser Supabase client (uses `NEXT_PUBLIC_*`)
  - `createClient()` in `server.ts` — an async server client bound to Next's `cookies()` with getAll/setAll

- [ ] **Step 1: Install ssr + add env**

```bash
npm install @supabase/ssr@^0.12.0
```
Get the anon key and append to `.env.local`:
```bash
npx supabase status
```
Copy the `anon key` value, then add these two lines to `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste anon key>
```

- [ ] **Step 2: Write the failing test**

`tests/supabase/clients.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createClient as createBrowser } from "@/lib/supabase/browser";

describe("supabase browser client", () => {
  it("constructs a client with a from() method", () => {
    const c = createBrowser();
    expect(typeof c.from).toBe("function");
    expect(typeof c.auth.signInWithPassword).toBe("function");
  });
});
```
(The server client uses `next/headers` cookies which aren't available in Vitest, so it's validated at runtime in later tasks, not unit-tested here.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/supabase/clients.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement the two factories**

`src/lib/supabase/browser.ts`:
```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

`src/lib/supabase/server.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component — safe to ignore; proxy refreshes the session
          }
        },
      },
    },
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/supabase/clients.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase package.json package-lock.json tests/supabase
git commit -m "feat(ui): @supabase/ssr browser + server client factories"
```
(Do not commit `.env.local` — it's gitignored.)

---

### Task 2: RLS policies + corrections table + quote name migration

**Files:**
- Create: `supabase/migrations/<ts>_ui_rls_and_corrections.sql`
- Modify: (none — SQL only)
- Test: `tests/db/rls.test.ts`

**Interfaces:**
- Produces: RLS policies (authenticated read/write, anon denied) on all app tables; a `corrections` table; a `name` column on `quotes` (for display).

- [ ] **Step 1: Create the migration**

Run `npx supabase migration new ui_rls_and_corrections`, fill:
```sql
-- Display name for a quote (project name captured at pricing time).
alter table quotes add column if not exists name text;

-- Corrections log: every engineer edit to a line's rate.
create table corrections (
  id uuid primary key default gen_random_uuid(),
  line_item_id uuid not null references line_items(id) on delete cascade,
  before_fils bigint,
  after_fils bigint not null,
  scope text not null check (scope in ('quote','trade')),
  user_id uuid,
  created_at timestamptz not null default now()
);
alter table corrections enable row level security;

-- Tighten the broad grants from earlier migrations to least-privilege, and add
-- authenticated-only policies. anon gets NOTHING on app tables.
-- (Phase 1 whole-branch carry-forward: replace `grant all ... to anon`.)
do $$
declare t text;
begin
  foreach t in array array[
    'projects','quotes','line_items','price_book_entries',
    'trade_skills','skill_versions','project_type_profiles','profile_versions',
    'line_item_tags','match_corpus','corrections'
  ] loop
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- Authenticated may read+write everything (single-tenant, two trusted users, no roles yet).
-- anon has no policies → denied. Each table: a permissive policy TO authenticated.
do $$
declare t text;
begin
  foreach t in array array[
    'projects','quotes','line_items','price_book_entries',
    'trade_skills','skill_versions','project_type_profiles','profile_versions',
    'line_item_tags','match_corpus','corrections'
  ] loop
    execute format($f$create policy %I on %I for select to authenticated using (true)$f$, t||'_sel', t);
    execute format($f$create policy %I on %I for insert to authenticated with check (true)$f$, t||'_ins', t);
    execute format($f$create policy %I on %I for update to authenticated using (true) with check (true)$f$, t||'_upd', t);
    execute format($f$create policy %I on %I for delete to authenticated using (true)$f$, t||'_del', t);
  end loop;
end $$;
```
Run: `npx supabase db reset`
Expected: applies cleanly.

- [ ] **Step 2: Write the failing test** (anon denied, service-role/authenticated allowed)

`tests/db/rls.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe("RLS", () => {
  it("denies anon reads on price_book_entries", async () => {
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const { data, error } = await c.from("price_book_entries").select("*").limit(1);
    // anon has no policy → RLS returns empty (or error). Either way, no rows.
    expect(error || (data && data.length === 0)).toBeTruthy();
  });
  it("allows service-role reads (bypass) — sanity that the table has data path", async () => {
    const c = createClient(url, service, { auth: { persistSession: false } });
    const { error } = await c.from("price_book_entries").select("*").limit(1);
    expect(error).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails/passes appropriately**

Run: `npm test -- tests/db/rls.test.ts`
Expected: FAIL first if the anon env var isn't set — ensure Task 1's `.env.local` anon key is present; then PASS (anon denied, service-role allowed).

- [ ] **Step 4: (no code — SQL is the implementation) confirm existing db tests still pass**

Run: `npm test -- tests/db/`
Expected: PASS — the existing repo tests use the service-role client (bypasses RLS), so they're unaffected.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations tests/db/rls.test.ts
git commit -m "feat(db): RLS policies (authenticated r/w, anon denied) + corrections table + quotes.name"
```

---

### Task 3: Quote persistence + list/get repos

**Files:**
- Modify: `src/lib/db/quotes.ts` (add `saveQuote`, `listQuotes`, `getQuote`)
- Create: `src/lib/db/corrections.ts`
- Test: `tests/db/quotes-ui.test.ts`

**Interfaces:**
- Consumes: existing `createProject`/`createQuote`/`insertLineItems`, `serviceClient`
- Produces:
  - `saveQuote(input: { name: string; rows: SaveRow[]; }): Promise<{ quoteId: string }>` where `SaveRow = { sortOrder; itemCode?; sectionRef; description; unitRaw?; unitCanonical?; quantityThousandths?; itemType; rateFils: number | null; amountFils: number | null; flags: string[] }`
  - `listQuotes(): Promise<Array<{ id; name; createdAt; grandTotalFils; flaggedCount }>>`
  - `getQuote(id): Promise<{ id; name; lines: LineItemRow[] }>`
  - `logCorrection(input: { lineItemId; beforeFils: number | null; afterFils: number; scope: 'quote' | 'trade'; userId?: string }): Promise<void>` (in corrections.ts)

- [ ] **Step 1: Write the failing test**

`tests/db/quotes-ui.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { saveQuote, listQuotes, getQuote } from "@/lib/db/quotes";
import { logCorrection } from "@/lib/db/corrections";

describe("quote persistence for UI", () => {
  it("saves a priced quote and reads it back in the list + detail", async () => {
    const name = `AlSafi test ${Date.now()}`;
    const { quoteId } = await saveQuote({
      name,
      rows: [
        { sortOrder: 0, itemCode: "1/1", sectionRef: "1", description: "بلاط", unitRaw: "م2", unitCanonical: "m2", quantityThousandths: 2_700_000, itemType: "unit_rate", rateFils: 13_388, amountFils: 36_147_600, flags: [] },
        { sortOrder: 1, itemCode: "1/2", sectionRef: "1", description: "بند غريب", unitType: undefined as never, unitRaw: undefined, unitCanonical: null, quantityThousandths: null, itemType: "unit_rate", rateFils: null, amountFils: null, flags: ["NO_MATCH"] },
      ],
    });
    expect(quoteId).toBeTruthy();

    const list = await listQuotes();
    const mine = list.find((q) => q.id === quoteId)!;
    expect(mine.name).toBe(name);
    expect(mine.grandTotalFils).toBe(36_147_600); // only the priced line
    expect(mine.flaggedCount).toBe(1);

    const detail = await getQuote(quoteId);
    expect(detail.lines).toHaveLength(2);
    expect(detail.lines[0].amount_fils).toBe(36_147_600);

    // correction log
    await logCorrection({ lineItemId: detail.lines[1].id, beforeFils: null, afterFils: 5000, scope: "quote" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/db/quotes-ui.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement `saveQuote`/`listQuotes`/`getQuote` in `quotes.ts`**

Append to `src/lib/db/quotes.ts`:
```ts
export interface SaveRow {
  sortOrder: number; itemCode?: string; sectionRef: string; description: string;
  unitRaw?: string; unitCanonical?: import("@/lib/domain/types").CanonicalUnit | null;
  quantityThousandths?: number | null; itemType: ItemType;
  rateFils: number | null; amountFils: number | null; flags: string[];
}

export async function saveQuote(input: { name: string; rows: SaveRow[] }): Promise<{ quoteId: string }> {
  const sc = serviceClient();
  const proj = await createProject({ name: input.name });
  const { data: q, error: qErr } = await sc.from("quotes")
    .insert({ project_id: proj.id, name: input.name, status: "final" }).select("id").single();
  if (qErr) throw qErr;
  const rows = input.rows.map((r) => ({
    quote_id: q.id, sort_order: r.sortOrder, item_code: r.itemCode, section_ref: r.sectionRef,
    description_original: r.description, unit_raw: r.unitRaw, unit_canonical: r.unitCanonical,
    quantity_thousandths: r.quantityThousandths, item_type: r.itemType,
    rate_fils: r.rateFils, amount_fils: r.amountFils, flags: r.flags,
  }));
  const { error: lErr } = await sc.from("line_items").insert(rows);
  if (lErr) throw lErr;
  return { quoteId: q.id };
}

export async function listQuotes() {
  const sc = serviceClient();
  const { data: quotes, error } = await sc.from("quotes")
    .select("id, name, created_at").order("created_at", { ascending: false });
  if (error) throw error;
  const out = [];
  for (const q of quotes) {
    const { data: lines } = await sc.from("line_items")
      .select("amount_fils, flags").eq("quote_id", q.id);
    const grandTotalFils = (lines ?? []).reduce((a, l) => a + (l.amount_fils ?? 0), 0);
    const flaggedCount = (lines ?? []).filter((l) => Array.isArray(l.flags) && l.flags.length > 0).length;
    out.push({ id: q.id, name: q.name, createdAt: q.created_at, grandTotalFils, flaggedCount });
  }
  return out;
}

export async function getQuote(id: string): Promise<{ id: string; name: string | null; lines: LineItemRow[] }> {
  const sc = serviceClient();
  const { data: q, error } = await sc.from("quotes").select("id, name").eq("id", id).single();
  if (error) throw error;
  const lines = await getQuoteItems(id);
  return { id: q.id, name: q.name, lines };
}
```
Note: `LineItemRow` needs `flags` typed — it already is (`flags: unknown[]`). Add `amount_fils`/`rate_fils` to the `LineItemRow` select if not already returned (getQuoteItems selects `*`, so they are).

`src/lib/db/corrections.ts`:
```ts
import { serviceClient } from "./client";

export async function logCorrection(input: {
  lineItemId: string; beforeFils: number | null; afterFils: number;
  scope: "quote" | "trade"; userId?: string;
}): Promise<void> {
  const { error } = await serviceClient().from("corrections").insert({
    line_item_id: input.lineItemId, before_fils: input.beforeFils,
    after_fils: input.afterFils, scope: input.scope, user_id: input.userId,
  });
  if (error) throw error;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/db/quotes-ui.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/quotes.ts src/lib/db/corrections.ts tests/db/quotes-ui.test.ts
git commit -m "feat(db): saveQuote/listQuotes/getQuote + corrections log repo"
```

---

### Task 4: Wire pipeline → saveQuote

**Files:**
- Modify: `src/lib/pipeline/run.ts` (return SaveRow-shaped data), `scripts/pipeline.ts` (call saveQuote)
- Test: `tests/pipeline/run.test.ts` (assert the run result exposes rows suitable for saveQuote — no new AI)

**Interfaces:**
- Consumes: `saveQuote` (Task 3), existing `runPipeline`
- Produces: `scripts/pipeline.ts` persists the quote to the DB after pricing (in addition to file export), keyed by a `--name` flag (defaults to the file basename).

- [ ] **Step 1: Write the failing test**

Add to `tests/pipeline/run.test.ts` (reuses the existing beforeAll fixtures):
```ts
it("exposes rows shaped for DB persistence (rateFils/amountFils/flags per line)", async () => {
  const adapter = makeAdapter(async (req) => {
    const idxs = [...req.prompt.matchAll(/^(\d+)\./gm)].map((m) => Number(m[1]));
    if (req.prompt.includes("نماذج التسعير المتاحة"))
      return JSON.stringify({ matches: idxs.map((i) => ({ index: i, costModelId: `${tradeSlug}.ceramic_floor`, confidence: 0.9 })) });
    return JSON.stringify({ tags: idxs.map((i) => ({ index: i, material: "ceramic", category: "floor" })) });
  });
  const out = await runPipeline({ file: boq, profileSlug, adapter, batchSize: 10 });
  const r = out.rows.find((x) => x.itemCode === "5/4")!;
  // priced-boq rows already carry rateJD/amountJD/flags; assert the raw fils are reachable for saveQuote
  expect(r.rateJD).toBe("13.388");
  expect(Array.isArray(r.flags)).toBe(true);
});
```

- [ ] **Step 2: Run to verify it passes (it already returns rows) — then wire the script**

Run: `npm test -- tests/pipeline/run.test.ts`
Expected: PASS (the row shape already exists from Phase 2). This test locks the contract; the real change is in the script.

- [ ] **Step 3: Add DB persistence to `scripts/pipeline.ts`**

The `runPipeline` result `rows` are `PricedRow` (rateJD/amountJD strings). saveQuote needs fils. Add a mapping in `scripts/pipeline.ts` using `parseJDToFils`, and a `--name` flag. Modify `scripts/pipeline.ts`:
```ts
import "./_env";
import { writeFileSync } from "node:fs";
import { claudeCliAdapter } from "../src/lib/ai/claude-cli";
import { runPipeline } from "../src/lib/pipeline/run";
import { writePricedExcel } from "../src/lib/export/priced-boq";
import { saveQuote } from "../src/lib/db/quotes";
import { parseJDToFils } from "../src/lib/domain/money";
import { normalizeUnit } from "../src/lib/domain/normalize";
import { parseQuantityToThousandths } from "../src/lib/domain/normalize";

async function main() {
  const args = process.argv.slice(2);
  const get = (f: string) => { const i = args.indexOf(f); return i === -1 ? undefined : args[i + 1]; };
  const file = get("--file"); const profileSlug = get("--type");
  const out = get("--out") ?? "priced-boq"; const name = get("--name") ?? file?.split("/").pop() ?? "quote";
  if (!file || !profileSlug) { console.error("الاستخدام: npm run pipeline -- --file <boq> --type <profileSlug> [--name <اسم>]"); process.exit(1); }

  const adapter = claudeCliAdapter({ timeoutMs: 240_000 });
  const result = await runPipeline({ file, profileSlug, adapter });
  writeFileSync(`${out}.json`, JSON.stringify(result.json, null, 2));
  await writePricedExcel(`${out}.xlsx`, result.rows, result.rollup);

  // Persist to the shared DB so the web UI can show it.
  const saveRows = result.rows.map((r, i) => ({
    sortOrder: i, itemCode: r.itemCode, sectionRef: r.sectionRef, description: r.description,
    unitRaw: r.unit, unitCanonical: r.unit ? normalizeUnit(r.unit) : null,
    quantityThousandths: r.quantity ? safeQty(r.quantity) : null,
    itemType: "unit_rate" as const,
    rateFils: r.rateJD ? parseJDToFils(r.rateJD) : null,
    amountFils: r.amountJD ? parseJDToFils(r.amountJD) : null,
    flags: r.flags,
  }));
  const { quoteId } = await saveQuote({ name, rows: saveRows });
  console.log(`✅ سُعّر ${result.rows.length} بنداً. المجموع: ${result.json["grandTotalJD"]} د.أ`);
  console.log(`   المخرجات: ${out}.json و ${out}.xlsx · حُفظت في قاعدة البيانات (${quoteId})`);
  if (result.ingestionWarnings.length) console.log(`⚠️  ${result.ingestionWarnings.length} تحذير استخراج`);
}
function safeQty(s: string): number | null { try { return parseQuantityToThousandths(s); } catch { return null; } }
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Confirm typecheck + suite**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean, all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/run.ts scripts/pipeline.ts tests/pipeline/run.test.ts
git commit -m "feat(pipeline): persist priced quote to the shared DB (--name), for the web UI"
```

---

### Task 5: Auth — proxy session refresh + login screen

**Files:**
- Create: `proxy.ts` (repo root), `src/app/login/page.tsx`, `src/app/login/actions.ts`
- Test: (manual/runtime — auth needs a browser session; no unit test)

**Interfaces:**
- Consumes: `src/lib/supabase/server.ts`
- Produces: session refresh on every request + redirect of unauthenticated users to `/login`; a working email/password sign-in.

- [ ] **Step 1: Create `proxy.ts`** (Next 16 renamed middleware → proxy)

`proxy.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith("/login");
  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone(); url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone(); url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Login page + action**

`src/app/login/actions.ts`:
```ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "بيانات الدخول غير صحيحة" };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

`src/app/login/page.tsx`:
```tsx
"use client";
import { useState } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        action={async (fd) => { const r = await signIn(fd); if (r?.error) setError(r.error); }}
        className="w-full max-w-sm space-y-4 border rounded-xl p-6"
      >
        <h1 className="text-xl font-medium">تسجيل الدخول</h1>
        <input name="email" type="email" required placeholder="البريد الإلكتروني" className="w-full border rounded p-2" />
        <input name="password" type="password" required placeholder="كلمة المرور" className="w-full border rounded p-2" />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="w-full border rounded p-2 bg-black text-white">دخول</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Runtime smoke** (documented, not a unit test)

Run: `npm run dev`, visit `/` → should redirect to `/login`. (You'll create a test user in Task 10 via `supabase` or the dashboard; for local dev, create one now via: `npx supabase status` won't create users — use the Studio at the local URL, Authentication → Add user, OR sign up is disabled by default so add via Studio.) Confirm signing in redirects to `/`.

- [ ] **Step 4: Commit**

```bash
git add proxy.ts src/app/login
git commit -m "feat(ui): auth — proxy session refresh + route gate + email/password login"
```

---

### Task 6: Authed app shell + dashboard

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`
- Test: (server-component data via existing repos, covered by their tests; screen is presentational)

**Interfaces:**
- Consumes: `listQuotes` (Task 3), `signOut` (Task 5), `listSkills` (add in this task), `getSnapshot`
- Produces: a nav shell (links: quotes, trades, price book, sign out) and a dashboard with counts + recent quotes.

- [ ] **Step 1: Add `listSkills` to `src/lib/db/skills.ts`**

```ts
export async function listSkills() {
  const { data, error } = await serviceClient()
    .from("trade_skills").select("slug, name_ar, active_version_id").order("name_ar");
  if (error) throw error;
  return data.map((s) => ({ slug: s.slug, nameAr: s.name_ar, hasActive: !!s.active_version_id }));
}
```

- [ ] **Step 2: App shell layout**

`src/app/(app)/layout.tsx`:
```tsx
import Link from "next/link";
import { signOut } from "../login/actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="border-b px-6 py-3 flex items-center gap-6 text-sm">
        <Link href="/" className="font-medium">منشئ عروض الأسعار</Link>
        <Link href="/quotes">عروض الأسعار</Link>
        <Link href="/trades">المهن والأسعار</Link>
        <Link href="/price-book">دفتر الأسعار</Link>
        <form action={signOut} className="ms-auto"><button className="text-red-600">خروج</button></form>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Dashboard**

`src/app/(app)/page.tsx`:
```tsx
import Link from "next/link";
import { listQuotes } from "@/lib/db/quotes";
import { listSkills } from "@/lib/db/skills";
import { filsToJDString } from "@/lib/domain/money";

export default async function Dashboard() {
  const [quotes, skills] = await Promise.all([listQuotes(), listSkills()]);
  const recent = quotes.slice(0, 5);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="عروض الأسعار" value={quotes.length} />
        <Stat label="المهن" value={skills.length} />
        <Stat label="بحاجة لمراجعة" value={quotes.reduce((a, q) => a + q.flaggedCount, 0)} />
      </div>
      <section>
        <h2 className="text-lg font-medium mb-2">أحدث العروض</h2>
        <ul className="divide-y border rounded-xl">
          {recent.map((q) => (
            <li key={q.id} className="p-3 flex justify-between">
              <Link href={`/quotes/${q.id}`} className="text-blue-700">{q.name ?? q.id}</Link>
              <span>{filsToJDString(q.grandTotalFils)} د.أ · {q.flaggedCount} مُعلّم</span>
            </li>
          ))}
          {recent.length === 0 && <li className="p-3 text-gray-500">لا توجد عروض بعد — شغّل الأنبوب محلياً.</li>}
        </ul>
      </section>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: number }) {
  return <div className="border rounded-xl p-4"><div className="text-sm text-gray-500">{label}</div><div className="text-3xl font-medium">{value}</div></div>;
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` (expect clean) and `npm run build` (expect success). Manually: log in → dashboard shows counts.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/layout.tsx" "src/app/(app)/page.tsx" src/lib/db/skills.ts
git commit -m "feat(ui): authed app shell + dashboard"
```

---

### Task 7: Quotes list + quote detail with line correction

**Files:**
- Create: `src/app/(app)/quotes/page.tsx`, `src/app/(app)/quotes/[id]/page.tsx`, `src/app/(app)/quotes/[id]/QuoteTable.tsx`, `src/app/(app)/quotes/[id]/CorrectionDialog.tsx`, `src/app/(app)/quotes/[id]/actions.ts`
- Test: `tests/ui/correction-action.test.ts` (the writeback logic)

**Interfaces:**
- Consumes: `getQuote`/`listQuotes` (Task 3), `logCorrection` (Task 3), `addPriceEntry` (existing), `filsToJDString`/`parseJDToFils`
- Produces: `applyCorrection(input: { lineItemId; newRateJD: string; quantityThousandths: number | null; scope: 'quote' | 'trade'; priceBookKey?: string; unit?: string; labelAr?: string }): Promise<void>` — updates the line's rate+amount always; if scope==='trade' and a priceBookKey is given, also adds a new price-book entry.

- [ ] **Step 1: Write the failing test** (the correction writeback)

`tests/ui/correction-action.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { applyCorrectionCore } from "@/app/(app)/quotes/[id]/actions";
import { saveQuote, getQuote } from "@/lib/db/quotes";
import { getSnapshot } from "@/lib/db/price-book";

describe("applyCorrection", () => {
  it("scope=quote updates only the line; scope=trade also writes a price-book entry", async () => {
    const { quoteId } = await saveQuote({ name: `c ${Date.now()}`, rows: [
      { sortOrder: 0, itemCode: "1", sectionRef: "1", description: "بلاط", unitRaw: "م2", unitCanonical: "m2", quantityThousandths: 1_000, itemType: "unit_rate", rateFils: 22000, amountFils: 22000, flags: [] },
    ]});
    const q = await getQuote(quoteId);
    const line = q.lines[0];

    // quote-only: line updates, no price-book change
    await applyCorrectionCore({ lineItemId: line.id, newRateJD: "18.000", quantityThousandths: 1_000, scope: "quote" });
    const q2 = await getQuote(quoteId);
    expect(q2.lines[0].rate_fils).toBe(18000);
    expect(q2.lines[0].amount_fils).toBe(18000); // 1 × 18

    // trade scope: also writes a dated price-book entry
    const key = `tile_correction_${Date.now()}`;
    await applyCorrectionCore({ lineItemId: line.id, newRateJD: "16.000", quantityThousandths: 1_000, scope: "trade", priceBookKey: key, unit: "m2", labelAr: "بلاط" });
    const snap = await getSnapshot();
    expect(snap[key].priceFils).toBe(16000);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/ui/correction-action.test.ts`
Expected: FAIL — module/function not found

- [ ] **Step 3: Implement the action core**

`src/app/(app)/quotes/[id]/actions.ts`:
```ts
"use server";
import { serviceClient } from "@/lib/db/client";
import { addPriceEntry } from "@/lib/db/price-book";
import { logCorrection } from "@/lib/db/corrections";
import { parseJDToFils, lineAmountFils } from "@/lib/domain/money";
import { revalidatePath } from "next/cache";

export interface CorrectionInput {
  lineItemId: string; newRateJD: string; quantityThousandths: number | null;
  scope: "quote" | "trade"; priceBookKey?: string; unit?: string; labelAr?: string;
}

// Pure core (testable without Next request context).
export async function applyCorrectionCore(input: CorrectionInput): Promise<void> {
  const sc = serviceClient();
  const newRateFils = parseJDToFils(input.newRateJD);
  const amountFils = input.quantityThousandths === null ? null : lineAmountFils(input.quantityThousandths, newRateFils);

  const { data: before } = await sc.from("line_items").select("rate_fils").eq("id", input.lineItemId).single();
  const { error } = await sc.from("line_items")
    .update({ rate_fils: newRateFils, amount_fils: amountFils }).eq("id", input.lineItemId);
  if (error) throw error;
  await logCorrection({ lineItemId: input.lineItemId, beforeFils: before?.rate_fils ?? null, afterFils: newRateFils, scope: input.scope });

  if (input.scope === "trade" && input.priceBookKey && input.unit) {
    await addPriceEntry({ key: input.priceBookKey, labelAr: input.labelAr ?? input.priceBookKey, unit: input.unit, priceFils: newRateFils });
  }
}

// Server action wrapper (revalidates the page).
export async function applyCorrection(quoteId: string, input: CorrectionInput): Promise<void> {
  await applyCorrectionCore(input);
  revalidatePath(`/quotes/${quoteId}`);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/ui/correction-action.test.ts`
Expected: PASS

- [ ] **Step 5: Build the screens** (presentational — no unit test)

`src/app/(app)/quotes/page.tsx`:
```tsx
import Link from "next/link";
import { listQuotes } from "@/lib/db/quotes";
import { filsToJDString } from "@/lib/domain/money";

export default async function QuotesList() {
  const quotes = await listQuotes();
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b text-right"><th className="p-2">المشروع</th><th className="p-2">التاريخ</th><th className="p-2">المجموع</th><th className="p-2">مُعلّم</th></tr></thead>
      <tbody>
        {quotes.map((q) => (
          <tr key={q.id} className="border-b hover:bg-gray-50">
            <td className="p-2"><Link href={`/quotes/${q.id}`} className="text-blue-700">{q.name ?? q.id}</Link></td>
            <td className="p-2">{new Date(q.createdAt).toLocaleDateString("ar")}</td>
            <td className="p-2">{filsToJDString(q.grandTotalFils)} د.أ</td>
            <td className="p-2">{q.flaggedCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

`src/app/(app)/quotes/[id]/page.tsx`:
```tsx
import { getQuote } from "@/lib/db/quotes";
import { QuoteTable } from "./QuoteTable";

export default async function QuoteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = await getQuote(id);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium">{quote.name ?? id}</h1>
      <QuoteTable quoteId={id} lines={quote.lines} />
    </div>
  );
}
```

`src/app/(app)/quotes/[id]/QuoteTable.tsx` (client component; renders lines, opens CorrectionDialog on a row, calls `applyCorrection`). `CorrectionDialog.tsx` (the this-quote-vs-update-trade popup). Full code:
```tsx
"use client";
import { useState } from "react";
import type { LineItemRow } from "@/lib/db/quotes";
import { filsToJDString } from "@/lib/domain/money";
import { applyCorrection } from "./actions";
import { CorrectionDialog } from "./CorrectionDialog";

export function QuoteTable({ quoteId, lines }: { quoteId: string; lines: LineItemRow[] }) {
  const [editing, setEditing] = useState<LineItemRow | null>(null);
  const grand = lines.reduce((a, l) => a + (l.amount_fils ?? 0), 0);
  return (
    <>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-right">
          <th className="p-2">الرقم</th><th className="p-2">الوصف</th><th className="p-2">الوحدة</th><th className="p-2">الكمية</th>
          <th className="p-2">سعر الوحدة</th><th className="p-2">المبلغ</th><th className="p-2">الحالة</th><th className="p-2"></th>
        </tr></thead>
        <tbody>
          {lines.map((l) => {
            const flagged = Array.isArray(l.flags) && (l.flags as string[]).length > 0;
            return (
              <tr key={l.id} className={`border-b ${flagged ? "bg-amber-50" : ""}`}>
                <td className="p-2">{l.item_code ?? "—"}</td>
                <td className="p-2 max-w-sm">{l.description_original}</td>
                <td className="p-2">{l.unit_raw ?? "—"}</td>
                <td className="p-2">{l.quantity_thousandths != null ? (l.quantity_thousandths / 1000).toString() : "—"}</td>
                <td className="p-2">{l.rate_fils != null ? filsToJDString(l.rate_fils) : "—"}</td>
                <td className="p-2">{l.amount_fils != null ? filsToJDString(l.amount_fils) : "—"}</td>
                <td className="p-2 text-xs">{(l.flags as string[]).join(", ") || "مُسعّر"}</td>
                <td className="p-2"><button className="text-blue-700" onClick={() => setEditing(l)}>تعديل</button></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot><tr className="font-medium"><td colSpan={5} className="p-2 text-left">المجموع الكلي</td><td className="p-2">{filsToJDString(grand)} د.أ</td><td colSpan={2}></td></tr></tfoot>
      </table>
      {editing && (
        <CorrectionDialog
          line={editing}
          onClose={() => setEditing(null)}
          onApply={async (newRateJD, scope) => {
            await applyCorrection(quoteId, {
              lineItemId: editing.id, newRateJD, quantityThousandths: editing.quantity_thousandths ?? null, scope,
            });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
```
```tsx
"use client";
import { useState } from "react";
import type { LineItemRow } from "@/lib/db/quotes";
import { filsToJDString } from "@/lib/domain/money";

export function CorrectionDialog({ line, onClose, onApply }: {
  line: LineItemRow; onClose: () => void; onApply: (newRateJD: string, scope: "quote" | "trade") => void;
}) {
  const [rate, setRate] = useState(line.rate_fils != null ? filsToJDString(line.rate_fils) : "");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
        <h3 className="font-medium">{line.description_original}</h3>
        <label className="block text-sm">سعر الوحدة (د.أ)
          <input value={rate} onChange={(e) => setRate(e.target.value)} className="w-full border rounded p-2 mt-1" placeholder="0.000" />
        </label>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="border rounded px-3 py-2">إلغاء</button>
          <button onClick={() => onApply(rate, "quote")} className="border rounded px-3 py-2">هذا العرض فقط</button>
          <button onClick={() => onApply(rate, "trade")} className="border rounded px-3 py-2 bg-black text-white">تحديث المهنة</button>
        </div>
      </div>
    </div>
  );
}
```
Note: rate input must be a valid JD string; `parseJDToFils` throws on bad input — the action will surface the error. (A polish task could add inline validation; v1 relies on the parser.)

- [ ] **Step 6: Verify + commit**

Run: `npx tsc --noEmit && npm test`
Expected: clean + green.
```bash
git add "src/app/(app)/quotes" tests/ui/correction-action.test.ts
git commit -m "feat(ui): quotes list + detail with line correction (this-quote vs update-trade)"
```

---

### Task 8: Rate library — price book editor

**Files:**
- Create: `src/app/(app)/price-book/page.tsx`, `src/app/(app)/price-book/PriceBookTable.tsx`, `src/app/(app)/price-book/actions.ts`
- Test: `tests/ui/price-book-action.test.ts`

**Interfaces:**
- Consumes: `getSnapshot`/`addPriceEntry` (existing), `parseJDToFils`/`filsToJDString`
- Produces: `upsertPriceEntry(input: { key; labelAr; unit; priceJD: string }): Promise<void>` (adds a new dated entry).

- [ ] **Step 1: Write the failing test**

`tests/ui/price-book-action.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { upsertPriceEntryCore } from "@/app/(app)/price-book/actions";
import { getSnapshot } from "@/lib/db/price-book";

describe("upsertPriceEntry", () => {
  it("adds a dated entry that shows in the snapshot as JD→fils", async () => {
    const key = `pb_ui_${Date.now()}`;
    await upsertPriceEntryCore({ key, labelAr: "اختبار", unit: "m2", priceJD: "12.500" });
    const snap = await getSnapshot();
    expect(snap[key].priceFils).toBe(12500);
  });
});
```

- [ ] **Step 2: Run to verify fail; implement**

`src/app/(app)/price-book/actions.ts`:
```ts
"use server";
import { addPriceEntry } from "@/lib/db/price-book";
import { parseJDToFils } from "@/lib/domain/money";
import { revalidatePath } from "next/cache";

export async function upsertPriceEntryCore(input: { key: string; labelAr: string; unit: string; priceJD: string }) {
  await addPriceEntry({ key: input.key, labelAr: input.labelAr, unit: input.unit, priceFils: parseJDToFils(input.priceJD) });
}
export async function upsertPriceEntry(input: { key: string; labelAr: string; unit: string; priceJD: string }) {
  await upsertPriceEntryCore(input);
  revalidatePath("/price-book");
}
```

Run: `npm test -- tests/ui/price-book-action.test.ts` → PASS.

- [ ] **Step 3: Screen** (server page loads snapshot; client table edits)

`src/app/(app)/price-book/page.tsx`:
```tsx
import { getSnapshot } from "@/lib/db/price-book";
import { PriceBookTable } from "./PriceBookTable";

export default async function PriceBookPage() {
  const snap = await getSnapshot();
  const rows = Object.entries(snap).map(([key, e]) => ({ key, unit: e.unit, priceFils: e.priceFils }));
  return <div className="space-y-4"><h1 className="text-xl font-medium">دفتر الأسعار</h1><PriceBookTable rows={rows} /></div>;
}
```
`PriceBookTable.tsx` (client): a table of key/unit/price with an editable price field per row calling `upsertPriceEntry`, plus an "add entry" row. Full code:
```tsx
"use client";
import { useState } from "react";
import { filsToJDString } from "@/lib/domain/money";
import { upsertPriceEntry } from "./actions";

export function PriceBookTable({ rows }: { rows: { key: string; unit: string; priceFils: number }[] }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState({ key: "", labelAr: "", unit: "m2", priceJD: "" });
  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <thead><tr className="border-b text-right"><th className="p-2">المفتاح</th><th className="p-2">الوحدة</th><th className="p-2">السعر (د.أ)</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b">
              <td className="p-2 font-mono text-xs">{r.key}</td>
              <td className="p-2">{r.unit}</td>
              <td className="p-2"><input defaultValue={filsToJDString(r.priceFils)} onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))} className="border rounded p-1 w-28" /></td>
              <td className="p-2"><button className="text-blue-700" onClick={() => upsertPriceEntry({ key: r.key, labelAr: r.key, unit: r.unit, priceJD: draft[r.key] ?? filsToJDString(r.priceFils) })}>حفظ</button></td>
            </tr>
          ))}
          <tr>
            <td className="p-2"><input placeholder="مفتاح جديد" value={adding.key} onChange={(e) => setAdding({ ...adding, key: e.target.value })} className="border rounded p-1" /></td>
            <td className="p-2"><input value={adding.unit} onChange={(e) => setAdding({ ...adding, unit: e.target.value })} className="border rounded p-1 w-16" /></td>
            <td className="p-2"><input placeholder="0.000" value={adding.priceJD} onChange={(e) => setAdding({ ...adding, priceJD: e.target.value })} className="border rounded p-1 w-28" /></td>
            <td className="p-2"><button className="bg-black text-white rounded px-2 py-1" onClick={() => adding.key && upsertPriceEntry({ ...adding, labelAr: adding.key })}>إضافة</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit && npm test` → clean + green.
```bash
git add "src/app/(app)/price-book" tests/ui/price-book-action.test.ts
git commit -m "feat(ui): price-book editor (dated entries)"
```

---

### Task 9: Rate library — trades editor with versioning + rollback

**Files:**
- Create: `src/app/(app)/trades/page.tsx`, `src/app/(app)/trades/[slug]/page.tsx`, `src/app/(app)/trades/[slug]/TradeEditor.tsx`, `src/app/(app)/trades/[slug]/VersionHistory.tsx`, `src/app/(app)/trades/[slug]/actions.ts`
- Test: `tests/ui/trade-action.test.ts`

**Interfaces:**
- Consumes: `listSkills` (Task 6), `getActiveSkill`/`createSkill`/`createSkillVersion`/`activateSkillVersion`/`listSkillVersions` (existing), `SkillContentSchema`
- Produces: `saveTradeCore(input: { slug; nameAr; content: SkillContent; changelog }): Promise<void>` — validates via `SkillContentSchema`, creates+activates a new version (creating the skill if new); `rollbackCore(slug, versionId): Promise<void>`.

- [ ] **Step 1: Write the failing test**

`tests/ui/trade-action.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { saveTradeCore, rollbackCore } from "@/app/(app)/trades/[slug]/actions";
import { getActiveSkill } from "@/lib/db/skills";

const content = (markup: string) => ({
  trade: "ui-tiling", costModels: [{
    id: "ui-tiling.floor", labelAr: "بلاط", unit: "m2" as const, keywords: ["بلاط"],
    components: [{ id: "m", kind: "material" as const, labelAr: "بلاط", priceBookKey: "tile_m2", qtyPerUnit: "1" }],
    wastePct: "5", markupPct: markup,
  }],
});

describe("trade editor actions", () => {
  it("save creates+activates a new version; rollback re-activates an older one", async () => {
    const slug = `ui-tiling-${Date.now()}`;
    await saveTradeCore({ slug, nameAr: "أعمال البلاط", content: { ...content("15"), trade: slug }, changelog: "أول" });
    const v1 = await getActiveSkill(slug);
    expect(v1?.content.costModels[0].markupPct).toBe("15");
    expect(v1?.versionNumber).toBe(1);

    await saveTradeCore({ slug, nameAr: "أعمال البلاط", content: { ...content("20"), trade: slug }, changelog: "رفع الربح" });
    const v2 = await getActiveSkill(slug);
    expect(v2?.versionNumber).toBe(2);
    expect(v2?.content.costModels[0].markupPct).toBe("20");

    // rollback to v1
    const { listSkillVersions } = await import("@/lib/db/skills");
    const { serviceClient } = await import("@/lib/db/client");
    const { data: skill } = await serviceClient().from("trade_skills").select("id").eq("slug", slug).single();
    const versions = await listSkillVersions(skill!.id);
    const v1id = versions.find((v) => v.versionNumber === 1)!.id;
    await rollbackCore(slug, v1id);
    expect((await getActiveSkill(slug))?.versionNumber).toBe(1);
  });

  it("rejects invalid content via the schema", async () => {
    await expect(saveTradeCore({ slug: `bad-${Date.now()}`, nameAr: "سيئ", content: { trade: "x", costModels: [{ nope: true }] } as never, changelog: "x" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify fail; implement action**

`src/app/(app)/trades/[slug]/actions.ts`:
```ts
"use server";
import { serviceClient } from "@/lib/db/client";
import { createSkill, createSkillVersion, activateSkillVersion } from "@/lib/db/skills";
import { SkillContentSchema, type SkillContent } from "@/lib/domain/skill-schema";
import { revalidatePath } from "next/cache";

async function skillIdBySlug(slug: string, nameAr: string): Promise<string> {
  const sc = serviceClient();
  const { data } = await sc.from("trade_skills").select("id").eq("slug", slug).maybeSingle();
  if (data) return data.id;
  const created = await createSkill(slug, nameAr);
  return created.id;
}

export async function saveTradeCore(input: { slug: string; nameAr: string; content: SkillContent; changelog: string }) {
  const content = SkillContentSchema.parse(input.content); // throws on invalid
  const skillId = await skillIdBySlug(input.slug, input.nameAr);
  const v = await createSkillVersion(skillId, content, input.changelog);
  await activateSkillVersion(skillId, v.id);
}
export async function saveTrade(input: { slug: string; nameAr: string; content: SkillContent; changelog: string }) {
  await saveTradeCore(input);
  revalidatePath(`/trades/${input.slug}`);
}
export async function rollbackCore(slug: string, versionId: string) {
  const sc = serviceClient();
  const { data } = await sc.from("trade_skills").select("id").eq("slug", slug).single();
  await activateSkillVersion(data!.id, versionId);
}
export async function rollback(slug: string, versionId: string) {
  await rollbackCore(slug, versionId);
  revalidatePath(`/trades/${slug}`);
}
```

Run: `npm test -- tests/ui/trade-action.test.ts` → PASS (both tests).

- [ ] **Step 3: Screens** (trades list, editor, version history)

`src/app/(app)/trades/page.tsx`:
```tsx
import Link from "next/link";
import { listSkills } from "@/lib/db/skills";

export default async function TradesList() {
  const skills = await listSkills();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium">المهن</h1>
      <ul className="divide-y border rounded-xl">
        {skills.map((s) => (
          <li key={s.slug} className="p-3"><Link href={`/trades/${s.slug}`} className="text-blue-700">{s.nameAr}</Link></li>
        ))}
      </ul>
    </div>
  );
}
```

`src/app/(app)/trades/[slug]/page.tsx`:
```tsx
import { getActiveSkill, listSkillVersions } from "@/lib/db/skills";
import { serviceClient } from "@/lib/db/client";
import { TradeEditor } from "./TradeEditor";
import { VersionHistory } from "./VersionHistory";

export default async function TradePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const active = await getActiveSkill(slug);
  const { data: skill } = await serviceClient().from("trade_skills").select("id, name_ar").eq("slug", slug).maybeSingle();
  const versions = skill ? await listSkillVersions(skill.id) : [];
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-medium">{skill?.name_ar ?? slug}</h1>
      <TradeEditor slug={slug} nameAr={skill?.name_ar ?? slug} content={active?.content ?? { trade: slug, costModels: [] }} />
      <VersionHistory slug={slug} versions={versions} activeVersionNumber={active?.versionNumber ?? null} />
    </div>
  );
}
```

`TradeEditor.tsx` (client) — edits cost models (labelAr, unit, keywords CSV, priceBookKey, wastePct, markupPct), add/remove models, Save → `saveTrade`. `VersionHistory.tsx` — lists versions with a rollback button per non-active version → `rollback`. Full code:
```tsx
"use client";
import { useState } from "react";
import type { SkillContent, CostModel } from "@/lib/domain/skill-schema";
import { saveTrade } from "./actions";

const UNITS = ["m2","m3","lm","ton","nr","ls","day","night","pc","hr","kg","pct"];

export function TradeEditor({ slug, nameAr, content }: { slug: string; nameAr: string; content: SkillContent }) {
  const [models, setModels] = useState<CostModel[]>(content.costModels);
  const [changelog, setChangelog] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function update(i: number, patch: Partial<CostModel>) { setModels((m) => m.map((x, j) => j === i ? { ...x, ...patch } : x)); }
  function addModel() {
    setModels((m) => [...m, { id: `${slug}.model_${m.length + 1}`, labelAr: "", unit: "m2", keywords: [],
      components: [{ id: "b", kind: "material", labelAr: "", priceBookKey: "", qtyPerUnit: "1" }], wastePct: "0", markupPct: "0" }]);
  }

  return (
    <div className="space-y-4">
      {models.map((m, i) => (
        <div key={i} className="border rounded-xl p-4 space-y-2">
          <div className="flex gap-2">
            <input value={m.labelAr} onChange={(e) => update(i, { labelAr: e.target.value })} placeholder="اسم النموذج" className="border rounded p-2 flex-1" />
            <select value={m.unit} onChange={(e) => update(i, { unit: e.target.value as CostModel["unit"] })} className="border rounded p-2">{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          </div>
          <input value={m.keywords.join("، ")} onChange={(e) => update(i, { keywords: e.target.value.split(/[،,]/).map((s) => s.trim()).filter(Boolean) })} placeholder="كلمات مفتاحية (مفصولة بفاصلة)" className="border rounded p-2 w-full" />
          <div className="flex gap-2">
            <input value={m.components[0]?.priceBookKey ?? ""} onChange={(e) => update(i, { components: [{ ...m.components[0], priceBookKey: e.target.value }] })} placeholder="مفتاح دفتر الأسعار" className="border rounded p-2 flex-1 font-mono text-xs" />
            <input value={m.wastePct} onChange={(e) => update(i, { wastePct: e.target.value })} placeholder="هدر %" className="border rounded p-2 w-20" />
            <input value={m.markupPct} onChange={(e) => update(i, { markupPct: e.target.value })} placeholder="ربح %" className="border rounded p-2 w-20" />
          </div>
        </div>
      ))}
      <button onClick={addModel} className="border rounded px-3 py-2">+ نموذج تسعير</button>
      <div className="flex gap-2 items-center border-t pt-4">
        <input value={changelog} onChange={(e) => setChangelog(e.target.value)} placeholder="سبب التعديل" className="border rounded p-2 flex-1" />
        <button disabled={saving} onClick={async () => {
          setSaving(true); setErr(null);
          try { await saveTrade({ slug, nameAr, content: { trade: slug, costModels: models }, changelog: changelog || "تعديل" }); }
          catch (e) { setErr("تعذّر الحفظ — تحقّق من صحة القيم"); }
          setSaving(false);
        }} className="bg-black text-white rounded px-4 py-2">{saving ? "..." : "حفظ نسخة جديدة"}</button>
      </div>
      {err && <p className="text-red-600 text-sm">{err}</p>}
    </div>
  );
}
```
```tsx
"use client";
import { rollback } from "./actions";

export function VersionHistory({ slug, versions, activeVersionNumber }: {
  slug: string; versions: { id: string; versionNumber: number; changelog: string | null; createdAt: string }[]; activeVersionNumber: number | null;
}) {
  return (
    <section>
      <h2 className="text-lg font-medium mb-2">سجل النسخ</h2>
      <ul className="divide-y border rounded-xl">
        {versions.map((v) => (
          <li key={v.id} className="p-3 flex justify-between items-center text-sm">
            <span>نسخة {v.versionNumber} · {v.changelog ?? ""} {v.versionNumber === activeVersionNumber && <b>(الحالية)</b>}</span>
            {v.versionNumber !== activeVersionNumber && <button onClick={() => rollback(slug, v.id)} className="text-blue-700">تفعيل</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit && npm test` → clean + green.
```bash
git add "src/app/(app)/trades" tests/ui/trade-action.test.ts
git commit -m "feat(ui): trades editor with immutable versioning + history + rollback"
```

---

### Task 10: Export button + deploy checklist

**Files:**
- Create: `src/app/(app)/quotes/[id]/export/route.ts`, `DEPLOY.md`
- Modify: `src/app/(app)/quotes/[id]/page.tsx` (add export link)
- Test: (route smoke — manual)

**Interfaces:**
- Consumes: `getQuote`, `toPricedRows`/`writePricedExcel` (existing export lib), `buildRollup`
- Produces: a GET route that streams the quote as an .xlsx; a deploy checklist for Mahmoud.

- [ ] **Step 1: Export route**

`src/app/(app)/quotes/[id]/export/route.ts`:
```ts
import { getQuote } from "@/lib/db/quotes";
import { buildRollup } from "@/lib/domain/rollup";
import ExcelJS from "exceljs";
import { filsToJDString } from "@/lib/domain/money";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = await getQuote(id);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("عرض السعر", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: "الرقم", key: "code", width: 10 }, { header: "الوصف", key: "desc", width: 50 },
    { header: "الوحدة", key: "unit", width: 8 }, { header: "الكمية", key: "qty", width: 12 },
    { header: "سعر الوحدة (د.أ)", key: "rate", width: 16 }, { header: "المبلغ (د.أ)", key: "amount", width: 16 },
    { header: "ملاحظات", key: "flags", width: 24 },
  ];
  for (const l of q.lines) ws.addRow({
    code: l.item_code, desc: l.description_original, unit: l.unit_raw,
    qty: l.quantity_thousandths != null ? l.quantity_thousandths / 1000 : "",
    rate: l.rate_fils != null ? filsToJDString(l.rate_fils) : "",
    amount: l.amount_fils != null ? filsToJDString(l.amount_fils) : "",
    flags: (l.flags as string[]).join(", "),
  });
  const rollup = buildRollup(q.lines.map((l) => ({ sectionRef: l.section_ref, amountFils: l.amount_fils })));
  ws.addRow({}); ws.addRow({ desc: "المجموع الكلي", amount: filsToJDString(rollup.grandTotalFils) });
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="quote-${id}.xlsx"`,
    },
  });
}
```
Add to `quotes/[id]/page.tsx` header: `<a href={`/quotes/${id}/export`} className="text-blue-700 text-sm">تصدير Excel</a>`.

- [ ] **Step 2: Write `DEPLOY.md`** (the checklist for Mahmoud — cloud Supabase + Vercel)

```markdown
# Deploy checklist (Mahmoud)

## 1. Create a hosted Supabase project
- supabase.com → New project. Note the project URL + anon key + service-role key.

## 2. Push the schema
- `npx supabase link --project-ref <ref>`
- `npx supabase db push`   # applies all migrations to the cloud DB

## 3. Create the two users
- Supabase dashboard → Authentication → Add user (you + the engineer), email+password.

## 4. Point your LOCAL pipeline at the cloud DB (so your runs show in the app)
- In `.env.local`, set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to the CLOUD values
  (and NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY to the cloud URL+anon).

## 5. Deploy the web app to Vercel
- Push the repo to GitHub, import into Vercel.
- Set Vercel env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (cloud values).
  Do NOT set the service-role key in Vercel — the app never uses it.
- Deploy. Share the URL + the engineer's login.

## 6. Generate a quote for them to see
- Run `npm run pipeline -- --file <boq> --type <profile> --name "<project>"` locally.
  It writes to the cloud DB; the engineer sees it in the app.
```

- [ ] **Step 3: Verify build + commit**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: clean, build succeeds, all tests green.
```bash
git add "src/app/(app)/quotes/[id]/export" "src/app/(app)/quotes/[id]/page.tsx" DEPLOY.md
git commit -m "feat(ui): Excel export route + deploy checklist"
```

---

## Self-Review Notes

- **Spec coverage:** login (T5), dashboard (T6), quotes list+detail+correction (T7), price-book editor (T8), trades editor+versioning+rollback (T9), export (T10), auth+RLS (T2/T5), pipeline→DB (T4), SSR clients (T1), corrections log (T2/T3), deploy checklist (T10). All spec §3–§7 items have a task.
- **RLS security:** anon revoked + no policies (denied); authenticated policies are permissive (single-tenant, two trusted users — matches spec's "everyone logged in can do everything"). The `TO authenticated using(true)` pattern is intentional here per the spec, NOT an IDOR bug, because there is no per-user ownership model yet (documented). Service-role stays server/pipeline-only.
- **Money:** all rate I/O via parseJDToFils/filsToJDString; lineAmountFils recomputes amounts on correction. No float math in UI.
- **Reuse:** server actions wrap existing repos + domain; export reuses exceljs the same way as `writePricedExcel`. No pricing logic duplicated.
- **Type consistency:** `SaveRow`, `LineItemRow`, `SkillContent`/`CostModel`, `CorrectionInput` consistent across tasks; `applyCorrectionCore`/`saveTradeCore`/`upsertPriceEntryCore` are the testable cores, with thin `revalidatePath` wrappers for the server-action form.
- **Known v1 constraints (documented):** the pipeline still runs locally/CLI (Vercel app is view/edit only); auth has no roles; profiles not editable in UI. All per the approved spec.
- **Test note:** server components/screens are presentational and validated via `tsc`/`build`; the testable logic (actions' cores, repos) has unit tests against local Supabase. Auth is runtime-verified (needs a browser session).
