import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseNewsletter, parseDutyRoster } from "./newsletter-parser";
import { writeDutyMonth } from "./duty";
import type { DutyAssignment } from "./duty-shared";
import { OllamaUnresponsiveError, llmProvider, ollamaHealthCheck, ollamaUnload } from "./llm";
import { JOBS_DIR, ensureDataDirs, eventsJsonPath, eventsMetaPath, newsletterPdfPath } from "./paths";

// Newsletter parsing runs as a background job instead of inside the upload
// request: on the local model it takes ~5 minutes, which outlives proxies and
// flaky connections. State lives on the data volume so the admin page can
// poll it, and so jobs interrupted by a pod restart resume on boot (see
// instrumentation.ts).

export const ParseStepSchema = z.enum(["events", "duty"]);
export type ParseStep = z.infer<typeof ParseStepSchema>;

const ParseJobSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  steps: z.array(ParseStepSchema).min(1),
  // Month typed in by the admin; when set, the parsed month never renames the PDF.
  explicitMonth: z.boolean(),
  source: z.string(),
  state: z.enum(["queued", "running", "done", "failed"]),
  step: ParseStepSchema.nullable(),
  // Per-step outcome, filled in as steps finish.
  results: z.record(z.string(), z.object({ ok: z.boolean(), message: z.string() })),
  createdAt: z.string(),
  updatedAt: z.string(),
  log: z.array(z.string()),
});
export type ParseJob = z.infer<typeof ParseJobSchema>;

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [30_000, 90_000];
const LOG_LINES = 30;

function jobPath(month: string): string {
  return path.join(JOBS_DIR, `${month}.json`);
}

async function readJob(month: string): Promise<ParseJob | null> {
  try {
    return ParseJobSchema.parse(JSON.parse(await fs.readFile(jobPath(month), "utf8")));
  } catch {
    return null;
  }
}

async function saveJob(job: ParseJob): Promise<void> {
  job.updatedAt = new Date().toISOString();
  const p = jobPath(job.month);
  await fs.writeFile(`${p}.tmp`, JSON.stringify(job, null, 2));
  await fs.rename(`${p}.tmp`, p);
}

async function logJob(job: ParseJob, line: string): Promise<void> {
  const stamped = `${new Date().toISOString().slice(11, 19)}Z ${line}`;
  console.log(`[parse-job ${job.month}] ${line}`);
  job.log = [...job.log, stamped].slice(-LOG_LINES);
  await saveJob(job);
}

export async function listParseJobs(): Promise<ParseJob[]> {
  await ensureDataDirs();
  const files = (await fs.readdir(JOBS_DIR)).filter((f) => /^\d{4}-\d{2}\.json$/.test(f));
  const jobs = await Promise.all(files.map((f) => readJob(f.slice(0, 7))));
  return jobs
    .filter((j): j is ParseJob => !!j)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function isParseJobActive(month: string): Promise<boolean> {
  const job = await readJob(month);
  return job?.state === "queued" || job?.state === "running";
}

export async function enqueueParseJob(opts: {
  month: string;
  steps: ParseStep[];
  explicitMonth?: boolean;
  source: string;
}): Promise<{ ok: boolean; message: string }> {
  await ensureDataDirs();
  const existing = await readJob(opts.month);
  if (existing && (existing.state === "queued" || existing.state === "running")) {
    return { ok: false, message: `A parse for ${opts.month} is already ${existing.state}.` };
  }
  const now = new Date().toISOString();
  await saveJob({
    month: opts.month,
    steps: opts.steps,
    explicitMonth: opts.explicitMonth ?? false,
    source: opts.source,
    state: "queued",
    step: null,
    results: {},
    createdAt: now,
    updatedAt: now,
    log: [`${now.slice(11, 19)}Z queued (${opts.steps.join(" + ")})`],
  });
  kick();
  return { ok: true, message: `Parsing ${opts.month} in the background (${opts.steps.join(" + ")}).` };
}

// Re-run whatever failed (or everything, if nothing is recorded as failed).
export async function retryParseJob(month: string): Promise<{ ok: boolean; message: string }> {
  const job = await readJob(month);
  if (!job) return { ok: false, message: `No parse job for ${month}.` };
  const failed = job.steps.filter((s) => job.results[s] && !job.results[s].ok);
  return enqueueParseJob({
    month,
    steps: failed.length ? failed : job.steps,
    explicitMonth: job.explicitMonth,
    source: job.source,
  });
}

// Called once at server start: anything left queued/running was interrupted
// by a restart, so put it back in the queue.
export async function resumeParseJobs(): Promise<void> {
  for (const job of await listParseJobs()) {
    if (job.state === "running" || job.state === "queued") {
      job.state = "queued";
      job.step = null;
      await logJob(job, "resumed after server restart");
    }
  }
  kick();
}

// ──────────────────────────────────────────────────────────────────────────
// Worker: one job at a time (the DGX serves one request at a time anyway).
// Kept on globalThis so dev-mode module reloads don't start a second worker.
// ──────────────────────────────────────────────────────────────────────────

const g = globalThis as unknown as { __srgcParseWorker?: Promise<void> | null };

function kick(): void {
  if (g.__srgcParseWorker) return;
  g.__srgcParseWorker = drain()
    .catch((e) => console.error("[parse-job] worker crashed:", e))
    .finally(() => {
      g.__srgcParseWorker = null;
    });
}

async function drain(): Promise<void> {
  for (;;) {
    const next = (await listParseJobs())
      .filter((j) => j.state === "queued")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!next) return;
    await runJob(next);
  }
}

async function runJob(job: ParseJob): Promise<void> {
  job.state = "running";
  await logJob(job, "started");
  const pdf = await fs.readFile(newsletterPdfPath(job.month)).catch(() => null);
  if (!pdf) {
    job.state = "failed";
    job.results = { events: { ok: false, message: "PDF not found" } };
    await logJob(job, `PDF for ${job.month} not found — re-upload it`);
    return;
  }

  // Events first: it may discover the newsletter is really for another month.
  const order = (["events", "duty"] as const).filter((s) => job.steps.includes(s));
  for (const step of order) {
    job.step = step;
    job.results[step] = await runStepWithRetries(job, step, pdf);
    await saveJob(job);
  }

  job.step = null;
  job.state = order.every((s) => job.results[s]?.ok) ? "done" : "failed";
  await logJob(job, job.state === "done" ? "finished" : "finished with errors");
}

async function runStepWithRetries(
  job: ParseJob,
  step: ParseStep,
  pdf: Buffer,
): Promise<{ ok: boolean; message: string }> {
  const ollama = llmProvider("parse") === "ollama";
  for (let attempt = 1; ; attempt++) {
    try {
      await logJob(job, `${step}: attempt ${attempt}/${MAX_ATTEMPTS}`);
      if (ollama) await ollamaHealthCheck();
      const message = step === "events" ? await runEvents(job, pdf) : await runDuty(job, pdf);
      await logJob(job, `${step}: ${message}`);
      return { ok: true, message };
    } catch (e) {
      const err = e as Error;
      await logJob(job, `${step}: attempt ${attempt} failed — ${err.message.split("\n")[0].slice(0, 300)}`);
      if (attempt >= MAX_ATTEMPTS) return { ok: false, message: err.message.split("\n")[0].slice(0, 500) };
      if (err instanceof OllamaUnresponsiveError) {
        // Known failure mode: a wedged gpt-oss runner. Unloading it resets it;
        // the next request reloads the model.
        await ollamaUnload().then(
          () => logJob(job, "unloaded the Ollama model to reset it"),
          (u) => logJob(job, `could not unload the Ollama model: ${(u as Error).message}`),
        );
      }
      const wait = BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
      await logJob(job, `${step}: retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function runEvents(job: ParseJob, pdf: Buffer): Promise<string> {
  const parsed = await parseNewsletter(pdf, job.source);
  const parsedMonth = /^\d{4}-\d{2}$/.test(parsed.month) ? parsed.month : job.month;
  const finalMonth = job.explicitMonth ? job.month : parsedMonth;
  // Write the events JSON FIRST. Only after that succeeds do we rename the
  // PDF — if the rename fails we still have the data, and if the events
  // write fails we haven't moved the PDF away from where we just put it.
  await fs.writeFile(eventsJsonPath(finalMonth), JSON.stringify(parsed.events, null, 2));
  if (parsed.eventsPage) {
    await fs.writeFile(eventsMetaPath(finalMonth), JSON.stringify({ eventsPage: parsed.eventsPage }, null, 2));
  } else {
    // No page reported — drop any stale meta so the pill hides cleanly.
    await fs.rm(eventsMetaPath(finalMonth), { force: true });
  }
  if (finalMonth !== job.month) {
    await fs.rename(newsletterPdfPath(job.month), newsletterPdfPath(finalMonth));
    return `${parsed.events.length} events — newsletter is actually ${finalMonth}, saved under that month`;
  }
  const page = parsed.eventsPage ? ` (table on page ${parsed.eventsPage})` : " (page not detected)";
  return `${parsed.events.length} events${page}`;
}

async function runDuty(job: ParseJob, pdf: Buffer): Promise<string> {
  const duty = await parseDutyRoster(pdf, job.source);
  // Group assignments by month and write one file per month.
  const byMonth = new Map<string, DutyAssignment[]>();
  for (const a of duty.assignments) {
    const key = a.date.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), a]);
  }
  const written: string[] = [];
  const skipped: string[] = [];
  const uploadedAt = new Date().toISOString();
  for (const month of duty.months) {
    const assignments = (byMonth.get(month) ?? []).sort((a, b) =>
      a.date === b.date ? a.role.localeCompare(b.role) : a.date.localeCompare(b.date),
    );
    if (assignments.length === 0) {
      skipped.push(month);
      continue;
    }
    await writeDutyMonth({ month, source: job.source, uploadedAt, assignments });
    written.push(month);
  }
  if (written.length === 0) throw new Error("Duty parse found no assignments");
  const skipNote = skipped.length
    ? ` (nothing found for ${skipped.join(", ")} — old data for those months is preserved)`
    : "";
  return `${duty.assignments.length} duty assignments across ${written.join(", ")}${skipNote}`;
}
