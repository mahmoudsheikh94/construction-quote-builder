import { describe, it, expect } from "vitest";
import { createClient as createBrowser } from "@/lib/supabase/browser";

describe("supabase browser client", () => {
  it("constructs a client with a from() method", () => {
    const c = createBrowser();
    expect(typeof c.from).toBe("function");
    expect(typeof c.auth.signInWithPassword).toBe("function");
  });
});
