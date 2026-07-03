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
