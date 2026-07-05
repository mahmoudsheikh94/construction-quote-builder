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
  // Prefer a fenced ```json block if present (the model's canonical wrapper).
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;

  // Naive first-bracket-to-last-bracket slicing breaks when prose contains stray
  // brackets (e.g. "[As per the drawing]") before the real payload. Instead, try
  // each bracket start position in order and return the first span that parses.
  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    if (ch !== "{" && ch !== "[") continue;
    const end = ch === "{" ? candidate.lastIndexOf("}") : candidate.lastIndexOf("]");
    if (end <= i) continue;
    try {
      return JSON.parse(candidate.slice(i, end + 1));
    } catch {
      // stray bracket in prose — advance to the next candidate start.
    }
  }
  throw new Error("لا يوجد JSON في مخرجات الذكاء الاصطناعي");
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
