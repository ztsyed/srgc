import "server-only";
import http from "node:http";
import https from "node:https";

// Which LLM backend handles a feature. "anthropic" sends PDFs straight to
// Claude; "ollama" runs a local model (gpt-oss on the DGX) over text we
// extract from the PDFs ourselves (see lib/pdf-text.ts).
export type LlmProvider = "anthropic" | "ollama";
export type LlmFeature = "parse" | "chat";

const FEATURE_ENV: Record<LlmFeature, string> = {
  parse: "PARSE_LLM_PROVIDER",
  chat: "CHAT_LLM_PROVIDER",
};

// Resolution order: per-feature override -> LLM_PROVIDER -> whichever backend
// is configured (Anthropic wins if both are, to keep existing deploys as-is).
export function llmProvider(feature: LlmFeature): LlmProvider {
  const raw = (process.env[FEATURE_ENV[feature]] || process.env.LLM_PROVIDER || "").trim().toLowerCase();
  if (raw === "anthropic" || raw === "ollama") return raw;
  if (raw) throw new Error(`Unknown LLM provider "${raw}" (expected "anthropic" or "ollama")`);
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OLLAMA_BASE_URL) return "ollama";
  throw new Error("No LLM configured — set ANTHROPIC_API_KEY or OLLAMA_BASE_URL");
}

export function anthropicApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return apiKey;
}

// ──────────────────────────────────────────────────────────────────────────
// Ollama
// ──────────────────────────────────────────────────────────────────────────

export function ollamaConfig() {
  return {
    baseUrl: (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, ""),
    model: process.env.OLLAMA_MODEL || "gpt-oss:120b",
    // Changing num_ctx forces Ollama to reload the model, so default to what
    // the DGX already serves gpt-oss:120b with.
    numCtx: Number(process.env.OLLAMA_NUM_CTX) || 65536,
  };
}

export type OllamaMessage = { role: "system" | "user" | "assistant"; content: string };

export type OllamaChatOptions = {
  messages: OllamaMessage[];
  // gpt-oss reasoning effort. Higher = more accurate, much slower.
  think?: "low" | "medium" | "high";
  // "json" constrains output to a single JSON value.
  format?: "json";
  maxTokens?: number;
  signal?: AbortSignal;
  // Max wait for Ollama to start answering (queueing + model load + prompt
  // processing). Past this the runner is assumed wedged.
  startTimeoutMs?: number;
};

// Ollama stopped responding (never started answering, or went silent
// mid-stream). Seen in practice: the gpt-oss runner wedges until the model is
// unloaded — callers can recover with ollamaUnload() and try again.
export class OllamaUnresponsiveError extends Error {
  name = "OllamaUnresponsiveError";
}

export type OllamaUsage = { inputTokens: number; outputTokens: number };

// Streams answer text deltas (reasoning tokens are dropped). Uses Ollama's
// streaming mode over node:http rather than fetch: Ollama serves one request
// at a time, and a request queued behind a multi-minute parse gets no response
// headers until it starts — fetch (undici) aborts that after 300s.
export async function* ollamaChatStream(
  opts: OllamaChatOptions,
): AsyncGenerator<string, OllamaUsage, void> {
  const { baseUrl, model, numCtx } = ollamaConfig();
  const body = JSON.stringify({
    model,
    messages: opts.messages,
    stream: true,
    think: opts.think ?? "low",
    ...(opts.format ? { format: opts.format } : {}),
    keep_alive: "24h",
    options: {
      num_ctx: numCtx,
      temperature: 0,
      ...(opts.maxTokens ? { num_predict: opts.maxTokens } : {}),
    },
  });
  const res = await postStream(`${baseUrl}/api/chat`, body, opts.signal, opts.startTimeoutMs ?? OLLAMA_START_TIMEOUT_MS);
  if (res.statusCode !== 200) {
    let detail = "";
    for await (const c of res) detail += c;
    throw new Error(`Ollama ${res.statusCode}: ${detail.slice(0, 500)}`);
  }

  // Once generation starts Ollama streams continuously (reasoning tokens
  // included), so a long silence means the connection is dead, not slow.
  res.setTimeout(OLLAMA_IDLE_TIMEOUT_MS, () =>
    res.destroy(new OllamaUnresponsiveError(`Ollama stream stalled (no data for ${OLLAMA_IDLE_TIMEOUT_MS / 1000}s)`)),
  );

  // Response is NDJSON: one chunk object per line, last one has done=true
  // plus token counts.
  res.setEncoding("utf8");
  let buf = "";
  const usage: OllamaUsage = { inputTokens: 0, outputTokens: 0 };
  for await (const data of res as AsyncIterable<string>) {
    buf += data;
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line) as {
        message?: { content?: string };
        done?: boolean;
        done_reason?: string;
        error?: string;
        prompt_eval_count?: number;
        eval_count?: number;
      };
      if (chunk.error) throw new Error(`Ollama: ${chunk.error}`);
      if (chunk.message?.content) yield chunk.message.content;
      if (chunk.done) {
        usage.inputTokens = chunk.prompt_eval_count ?? 0;
        usage.outputTokens = chunk.eval_count ?? 0;
        if (chunk.done_reason === "length") {
          throw new Error("Ollama hit the output token limit before finishing");
        }
      }
    }
  }
  return usage;
}

const OLLAMA_IDLE_TIMEOUT_MS = 120_000;
// Generous: a parse can sit queued behind another parse (~3 min) on the
// single-slot DGX, plus model load and ~40k tokens of prompt processing.
const OLLAMA_START_TIMEOUT_MS = 8 * 60_000;

function postStream(
  url: string,
  body: string,
  signal: AbortSignal | undefined,
  startTimeoutMs: number,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = (u.protocol === "https:" ? https : http).request(
      u,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        signal,
      },
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
    );
    const timer = setTimeout(
      () => req.destroy(new OllamaUnresponsiveError(`Ollama did not start answering within ${Math.round(startTimeoutMs / 1000)}s`)),
      startTimeoutMs,
    );
    req.on("error", (e) => {
      clearTimeout(timer);
      reject(e instanceof OllamaUnresponsiveError ? e : new Error(`Ollama request to ${u.host} failed: ${e.message}`));
    });
    req.end(body);
  });
}

export async function ollamaChat(opts: OllamaChatOptions): Promise<string> {
  let text = "";
  for await (const delta of ollamaChatStream(opts)) text += delta;
  return text;
}

// Unloads the model (what `ollama stop` does). Unwedges a hung runner; the
// next request reloads it automatically (~15s for gpt-oss:120b).
export async function ollamaUnload(): Promise<void> {
  const { baseUrl, model } = ollamaConfig();
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, keep_alive: 0 }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Ollama unload failed: ${res.status} ${await res.text().catch(() => "")}`);
}

// Tiny round trip through the model. Loads it if it isn't loaded, and
// surfaces a wedged runner before we spend minutes on a real parse.
export async function ollamaHealthCheck(): Promise<void> {
  await ollamaChat({
    messages: [{ role: "user", content: "Reply with the word ok." }],
    think: "low",
    maxTokens: 256,
    startTimeoutMs: 4 * 60_000,
  });
}
