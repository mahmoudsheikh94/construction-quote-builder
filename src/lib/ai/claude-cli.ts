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
