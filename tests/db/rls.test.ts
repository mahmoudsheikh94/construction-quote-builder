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
