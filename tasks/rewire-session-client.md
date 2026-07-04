# Fix: Web app must read/write via the session (anon+RLS) client, not service-role

## Problem
Vercel build fails: `/` prerenders and `serviceClient()` throws "متغيرات Supabase البيئية مفقودة"
because SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are (correctly) not set on Vercel. The whole
authenticated app reads/writes through `lib/db/*` → `serviceClient()` (RLS-bypass). Per the
Phase 3 design, the WEB APP must use the user-session anon client (RLS-enforced); the
service-role client is for the LOCAL pipeline only.

## Approach (minimal blast radius)
Give every `lib/db/*` function an **optional** trailing `db?: SupabaseClient` param that
defaults to `serviceClient()`. Callers that pass nothing (pipeline, seed, tests, saveQuote)
are unchanged. App pages/actions pass the session client from `lib/supabase/server`.

This is additive — no existing signature breaks, `*Core` functions stay testable, and the
service-role path stays intact for the local pipeline.

## Global constraints (unchanged)
- Money: integer fils, parseJDToFils/filsToJDString/lineAmountFils only. No float. Don't touch money logic.
- Service-role key: never in the browser, never in Vercel. Only NEXT_PUBLIC_* on Vercel.
- RLS: authenticated may r/w all app tables (permissive, single-tenant). anon denied.
- Behavior of every repo function must be identical when called with no client arg.

## Tasks

### T1 — repo functions accept optional client
Files: src/lib/db/quotes.ts, skills.ts, price-book.ts, corrections.ts
- Add `import type { SupabaseClient } from "@supabase/supabase-js"` to each.
- Every exported async fn that calls `serviceClient()` gains a trailing param `db: SupabaseClient = serviceClient()`
  and uses `db` instead of `serviceClient()` internally.
- For fns that internally call OTHER repo fns (saveQuote→createProject; getQuote→getQuoteItems;
  applyCorrectionCore→logCorrection/addPriceEntry; createSkillVersion self-calls; getActiveSkill,
  getActiveProfile self-call), thread the same `db` through so a session-client call stays session-client end to end.
  - saveQuote: `createProject(input, db)`; getQuote: `getQuoteItems(id, db)`.
- Keep default `= serviceClient()` so no existing caller changes.

### T2 — app read pages pass the session client
Each is an async server component. Add `const db = await createClient()` (from `@/lib/supabase/server`)
and pass `db` to the repo calls.
- src/app/(app)/page.tsx: `listQuotes(db)`, `listSkills(db)`
- src/app/(app)/quotes/page.tsx: `listQuotes(db)`
- src/app/(app)/quotes/[id]/page.tsx: `getQuote(id, db)`
- src/app/(app)/price-book/page.tsx: `getSnapshot(undefined, db)` (asOf stays default)
- src/app/(app)/trades/page.tsx: `listSkills(db)`
- src/app/(app)/trades/[slug]/page.tsx: `getActiveSkill(slug, db)`, `listSkillVersions(skill.id, db)`,
  and the raw `serviceClient().from("trade_skills")...` → `db.from(...)`

Note: `createClient()` (session) returns SupabaseClient from @supabase/ssr; assignable to the param type.

### T3 — app server action *Core fns accept optional client (default session)
CONFIRMED: 3 test files call the *Core fns directly (correction-action, price-book-action,
trade-action). So the cores CANNOT hardcode `await createClient()` (no cookies in vitest).
Pattern: each *Core gains a trailing `db?: SupabaseClient` param. When omitted, it defaults to
the session client via `await createClient()` (used by the action wrappers, in request context).
Tests pass a service client explicitly. Implementation:
  export async function applyCorrectionCore(input, db?: SupabaseClient) {
    const sc = db ?? await createClient();
    ... use sc for before-select + update; logCorrection(..., sc); addPriceEntry(..., sc);
  }
- price-book/actions.ts: `upsertPriceEntryCore(input, db?)` → `const sc = db ?? await createClient(); addPriceEntry({...}, sc)`.
- quotes/[id]/actions.ts: `applyCorrectionCore(input, db?)` → sc for before-select, line update, logCorrection(sc), addPriceEntry(sc).
- trades/[slug]/actions.ts: `saveTradeCore(input, db?)` + `rollbackCore(slug, versionId, db?)` +
  `skillIdBySlug(slug, nameAr, db)` → sc for raw trade_skills queries and createSkill/createSkillVersion/activateSkillVersion.
- Action WRAPPERS (applyCorrection/upsertPriceEntry/saveTrade/rollback) call the core with NO db arg → session client.
- `import type { SupabaseClient } from "@supabase/supabase-js"` and `import { createClient } from "@/lib/supabase/server"` in each actions.ts.

### T4 — force dynamic rendering on the app segment
The (app) pages read per-request session cookies; they must NOT be prerendered at build.
Add to `src/app/(app)/layout.tsx`: `export const dynamic = "force-dynamic";`
(Belt-and-suspenders: cookies() already opts routes out of static, but the build tried to prerender `/`,
so make it explicit.)

### T5 — keep tests green
The `*Core` action tests (if any call applyCorrectionCore/upsertPriceEntryCore/saveTradeCore directly)
now build a session client via createClient() which needs cookies() — unavailable in vitest.
Check: do any tests import the *Core fns? If yes, they need the service path.
- Inspect tests/. The db tests call the REPO fns directly (default service client) — fine, unchanged.
- If action *Core tests exist and break, the cleanest fix: those cores accept optional `db` too,
  defaulting to `await createClient()`, tests pass a service client. But prefer: verify no test imports
  the action cores before adding params. (Likely none — actions were smoke-tested manually per the plan.)

### Verify
- `npx tsc --noEmit` clean
- `npm test` — all 115 green
- `npm run build` succeeds locally (the real gate — must prerender/compile with NO service-role env)
  Run with service-role env UNSET to simulate Vercel:
  `env -u SUPABASE_SERVICE_ROLE_KEY -u SUPABASE_URL npm run build`
- Confirm no `(app)` page/action imports `@/lib/db/client` (serviceClient) anymore.
