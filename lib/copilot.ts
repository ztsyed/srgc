import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { HANDBOOK_PATH, PDF_DIR, ensureDataDirs } from "./paths";
import { anthropicApiKey, llmProvider, ollamaChatStream, ollamaConfig, type OllamaMessage } from "./llm";
import { formatPages, pdfFileText } from "./pdf-text";

export const ChatRoleSchema = z.enum(["user", "assistant"]);
export const ChatMessageSchema = z.object({
  role: ChatRoleSchema,
  content: z.string().min(1).max(8000),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

const SYSTEM_PROMPT = `You are the Sunnyvale Rod & Gun Club (SRGC) copilot.
Members ask you questions and you answer using the documents attached:

- The SRGC Policies and Procedures Handbook (the rule book).
- The most recent monthly newsletters ("The Target Shooter") which list the
  month's events, work parties, duty roster, board members, contact info,
  and other timely updates.

Guidelines:
- Answer concisely and directly. Two or three short paragraphs at most.
- Quote or paraphrase the relevant rule or notice when useful.
- ALWAYS cite the source you used at the end of the answer in this format:
  "— Handbook §<section name>" for the handbook, or
  "— <Month Year> newsletter, p.<n>" for a newsletter.
  Use multiple citations when the answer combines sources.
- If the answer isn't in the documents, say so plainly. Do not guess.
  Do not invent rules, dates, or names.
- Today's date is provided in the user's first message — use it when the
  user asks about "next" anything.
- For schedule questions about today/upcoming dates, prefer the most
  recent newsletter that covers that date.
- If the user asks for someone's contact info that's in the newsletter
  (committee chairs, range master, etc.), share what's printed there.`;

async function listNewsletterPdfs(): Promise<{ month: string; abs: string }[]> {
  await ensureDataDirs();
  const files = await fs.readdir(PDF_DIR);
  return files
    .filter((f) => /^\d{4}-\d{2}\.pdf$/.test(f))
    .map((f) => ({ month: f.slice(0, 7), abs: path.join(PDF_DIR, f) }))
    .sort((a, b) => b.month.localeCompare(a.month));      // newest first
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

// Module-level cache: avoid re-reading + re-base64-encoding 3MB of PDFs on
// every chat turn. Keyed by (absolute path, mtime). When the user replaces a
// PDF via /admin, mtime changes and the entry is rebuilt.
const pdfBase64Cache = new Map<string, string>();
async function readPdfAsBase64(absPath: string): Promise<string> {
  const stat = await fs.stat(absPath);
  const key = `${absPath}|${stat.mtimeMs}`;
  const cached = pdfBase64Cache.get(key);
  if (cached) return cached;
  // Drop any stale entry for this path so the cache doesn't grow unbounded.
  for (const k of pdfBase64Cache.keys()) {
    if (k.startsWith(`${absPath}|`)) pdfBase64Cache.delete(k);
  }
  const data = await fs.readFile(absPath);
  const b64 = data.toString("base64");
  pdfBase64Cache.set(key, b64);
  return b64;
}

async function asDocBlock(absPath: string, title: string): Promise<Anthropic.DocumentBlockParam> {
  const b64 = await readPdfAsBase64(absPath);
  return {
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: b64 },
    title,
  };
}

// Build the corpus prefix that we mark as cacheable. Caller appends the
// conversation messages on top.
async function buildCorpusBlocks(maxNewsletters = 6): Promise<Anthropic.ContentBlockParam[]> {
  const blocks: Anthropic.ContentBlockParam[] = [];
  if (await fileExists(HANDBOOK_PATH)) {
    blocks.push(await asDocBlock(HANDBOOK_PATH, "SRGC Policies and Procedures Handbook"));
  }
  const newsletters = (await listNewsletterPdfs()).slice(0, maxNewsletters);
  for (const n of newsletters) {
    blocks.push(await asDocBlock(n.abs, newsletterTitle(n.month)));
  }
  return blocks;
}

function newsletterTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const monthName = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return `The Target Shooter — ${monthName}`;
}

export async function streamCopilotReply(
  history: ChatMessage[],
  question: string,
): Promise<ReadableStream<Uint8Array>> {
  return llmProvider("chat") === "ollama"
    ? streamOllamaReply(history, question)
    : streamClaudeReply(history, question);
}

async function streamClaudeReply(
  history: ChatMessage[],
  question: string,
): Promise<ReadableStream<Uint8Array>> {
  const client = new Anthropic({ apiKey: anthropicApiKey() });

  const corpus = await buildCorpusBlocks();
  if (corpus.length === 0) {
    throw new Error("No documents loaded yet — upload the handbook and a newsletter via /admin first.");
  }

  // Mark the last corpus block as a cache breakpoint. Anthropic prompt
  // caching extends the cache up to and including the marked block, so
  // the entire corpus prefix gets cached.
  const last = corpus[corpus.length - 1] as Anthropic.DocumentBlockParam;
  corpus[corpus.length - 1] = { ...last, cache_control: { type: "ephemeral" } };

  const today = new Date().toISOString().slice(0, 10);
  const userBlocks: Anthropic.ContentBlockParam[] = [
    ...corpus,
    { type: "text", text: `Today's date is ${today}.\n\nQuestion: ${question}` },
  ];

  // Convert chat history into Anthropic message format. The current question
  // is the final user message.
  const messages: Anthropic.MessageParam[] = [];
  for (const m of history) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: "user", content: userBlocks });

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  });

  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta" &&
            event.delta.text
          ) {
            controller.enqueue(encoder.encode(sseLine("token", event.delta.text)));
          }
        }
        const final = await stream.finalMessage();
        const usage = final.usage;
        controller.enqueue(encoder.encode(sseLine("done", {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheReadTokens: usage.cache_read_input_tokens ?? 0,
          cacheCreatedTokens: usage.cache_creation_input_tokens ?? 0,
        })));
      } catch (e) {
        controller.enqueue(encoder.encode(sseLine("error", (e as Error).message)));
      } finally {
        controller.close();
      }
    },
    cancel() {
      // Client closed the connection — stop the upstream Claude call.
      stream.controller.abort();
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Ollama (gpt-oss) — text-only, so the corpus is pdftotext output
// ──────────────────────────────────────────────────────────────────────────

// Rough chars-per-token for compacted pdftotext output; only used to decide
// how many newsletters fit, so it errs on the generous side.
const CHARS_PER_TOKEN = 3.5;
// Most recent turns kept for the local model — the corpus dominates the window.
const OLLAMA_MAX_HISTORY = 12;

// Handbook + as many recent newsletters as fit in ~60% of the context window,
// leaving the rest for history, reasoning and the answer.
async function buildTextCorpus(): Promise<{ text: string; docs: number }> {
  const budget = ollamaConfig().numCtx * 0.6 * CHARS_PER_TOKEN;
  const parts: string[] = [];
  let used = 0;
  if (await fileExists(HANDBOOK_PATH)) {
    const doc = docText("SRGC Policies and Procedures Handbook", await pdfFileText(HANDBOOK_PATH));
    parts.push(doc);
    used += doc.length;
  }
  const newsletters = (await listNewsletterPdfs()).slice(0, 6);
  for (const [i, n] of newsletters.entries()) {
    const doc = docText(newsletterTitle(n.month), await pdfFileText(n.abs));
    // Always include the newest newsletter, even if it overflows.
    if (i > 0 && used + doc.length > budget) break;
    parts.push(doc);
    used += doc.length;
  }
  return { text: parts.join("\n\n"), docs: parts.length };
}

// The roster table's page text doesn't say which day a cell belongs to (see
// pdf-text.ts), so newsletters also carry the day-by-day normalised roster.
function docText(title: string, { pages, dutyRoster }: { pages: string[]; dutyRoster: string | null }): string {
  const roster = dutyRoster
    ? `\n=== duty roster (one entry per day) ===\n${dutyRoster}`
    : "";
  return `<document title="${title}">\n${formatPages(pages, "page", true)}${roster}\n</document>`;
}

async function streamOllamaReply(
  history: ChatMessage[],
  question: string,
): Promise<ReadableStream<Uint8Array>> {
  const corpus = await buildTextCorpus();
  if (corpus.docs === 0) {
    throw new Error("No documents loaded yet — upload the handbook and a newsletter via /admin first.");
  }

  // Corpus goes in the system message so the prompt prefix is identical
  // across turns and Ollama can reuse its KV cache instead of re-reading it.
  const system =
    SYSTEM_PROMPT +
    `\n\nThe documents are plain text extracted from the PDFs. Each page starts
with a line "=== page n ===" — use those numbers for newsletter citations.
Each newsletter ends with its duty roster rewritten one entry per day; prefer
it for "who is on duty" questions and cite it as
"— <Month Year> newsletter, duty roster".
Write plain prose (light Markdown is fine); no tables.\n\n` +
    corpus.text;

  const today = new Date().toISOString().slice(0, 10);
  const messages: OllamaMessage[] = [
    { role: "system", content: system },
    ...history.slice(-OLLAMA_MAX_HISTORY).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: `Today's date is ${today}.\n\nQuestion: ${question}` },
  ];

  const abort = new AbortController();
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = ollamaChatStream({ messages, think: "medium", maxTokens: 8192, signal: abort.signal });
        let step = await stream.next();
        while (!step.done) {
          controller.enqueue(encoder.encode(sseLine("token", step.value)));
          step = await stream.next();
        }
        controller.enqueue(encoder.encode(sseLine("done", {
          ...step.value,
          cacheReadTokens: 0,
          cacheCreatedTokens: 0,
        })));
      } catch (e) {
        if (!abort.signal.aborted) {
          controller.enqueue(encoder.encode(sseLine("error", (e as Error).message)));
        }
      } finally {
        try { controller.close(); } catch { /* already closed by cancel */ }
      }
    },
    cancel() {
      // Client closed the connection — stop generation on the DGX.
      abort.abort();
    },
  });
}

// JSON-encoded data so newlines / backslashes / quotes survive the wire
// untouched. Client does JSON.parse on the data field.
function sseLine(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}
