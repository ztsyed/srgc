import "server-only";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

// Text-only models (Ollama / gpt-oss) can't read PDFs, so we extract text with
// poppler's pdftotext. `-layout` keeps table columns aligned, which is what
// makes the newsletter's "Upcoming Events" table parseable as plain text.

const execFileAsync = promisify(execFile);

async function withTempPdf<T>(pdf: Buffer, fn: (pdfPath: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "srgc-pdf-"));
  try {
    const p = path.join(dir, "in.pdf");
    await fs.writeFile(p, pdf);
    return await fn(p);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function pdftotext(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("pdftotext", args, { maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("pdftotext not found — install poppler-utils");
    }
    throw e;
  }
}

// One string per page (1-indexed page N is pages[N-1]).
export async function pdfPages(pdf: Buffer): Promise<string[]> {
  const out = await withTempPdf(pdf, (p) => pdftotext(["-layout", "-enc", "UTF-8", p, "-"]));
  const pages = out.split("\f");
  if (pages.length > 1 && !pages[pages.length - 1].trim()) pages.pop(); // trailing form feed
  return pages;
}

// Pages joined with explicit markers so the model can report/cite page numbers.
// `compact` squeezes the wide layout padding — roughly halves the token count,
// which matters for the chat corpus but would blur table columns for parsing.
export function formatPages(pages: string[], label = "PAGE", compact = false): string {
  return pages
    .map((text, i) => {
      let body = text.replace(/[ \t]+$/gm, "");
      if (compact) body = body.replace(/ {3,}/g, "  ").replace(/\n{3,}/g, "\n\n");
      return `=== ${label} ${i + 1} ===\n${body.trim()}`;
    })
    .join("\n\n");
}

// Cache for the chat corpus: re-running pdftotext on the handbook + several
// newsletters every turn is wasteful. Keyed by (path, mtime) like the base64
// cache in copilot.ts.
type FileText = { pages: string[]; dutyRoster: string | null };
const fileTextCache = new Map<string, FileText>();
export async function pdfFileText(absPath: string): Promise<FileText> {
  const stat = await fs.stat(absPath);
  const key = `${absPath}|${stat.mtimeMs}`;
  const cached = fileTextCache.get(key);
  if (cached) return cached;
  for (const k of fileTextCache.keys()) {
    if (k.startsWith(`${absPath}|`)) fileTextCache.delete(k);
  }
  const pdf = await fs.readFile(absPath);
  const [pages, dutyRoster] = await Promise.all([pdfPages(pdf), extractDutyRosterText(pdf)]);
  const entry = { pages, dutyRoster };
  fileTextCache.set(key, entry);
  return entry;
}

// ──────────────────────────────────────────────────────────────────────────
// Duty roster normalisation
// ──────────────────────────────────────────────────────────────────────────
//
// The roster table defeats plain-text extraction: each day's cells are
// bottom-aligned to the day label, so multi-line cells (ATA officer lists,
// Tuesday AM/PM splits) start several lines *above* their day and read as if
// they belong to the previous row. Using pdftotext's word boxes we put every
// text block in its row (the first day label whose bottom edge is at or below
// the block's bottom edge) and column (by header x-position), then emit one
// unambiguous record per day for the model.

type Box = { xMin: number; yMin: number; xMax: number; yMax: number; lines: string[] };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
const COLUMNS = ["Rangemaster", "Range Safety Officers", "Trap Captain", "Trap Officers"];

function decodeEntities(s: string): string {
  return s
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Parse pdftotext -bbox-layout XHTML into per-page block lists. pdftotext
// sometimes glues a column header onto the cell below it ("Rangemaster" +
// first day's RMs), so header lines are split off into their own block.
function parseBboxLayout(xhtml: string): Box[][] {
  const pages: Box[][] = [];
  const num = (s: string) => Number(s);
  const coords = (m: RegExpMatchArray) => ({ xMin: num(m[1]), yMin: num(m[2]), xMax: num(m[3]), yMax: num(m[4]) });
  for (const page of xhtml.split(/<page\b/).slice(1)) {
    const blocks: Box[] = [];
    const blockRe = /<block xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/block>/g;
    const lineRe = /<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/line>/g;
    for (const b of page.matchAll(blockRe)) {
      const lines = [...b[5].matchAll(lineRe)].map((l) => ({
        ...coords(l),
        text: [...l[5].matchAll(/<word\b[^>]*>([^<]*)<\/word>/g)].map((w) => decodeEntities(w[1])).join(" "),
      }));
      if (lines.length > 1 && COLUMNS.includes(lines[0].text)) {
        const [head, ...rest] = lines;
        blocks.push({ ...coords(b), ...head, lines: [head.text] });
        blocks.push({
          xMin: Math.min(...rest.map((l) => l.xMin)),
          yMin: Math.min(...rest.map((l) => l.yMin)),
          xMax: Math.max(...rest.map((l) => l.xMax)),
          yMax: Math.max(...rest.map((l) => l.yMax)),
          lines: rest.map((l) => l.text),
        });
      } else {
        blocks.push({ ...coords(b), lines: lines.map((l) => l.text) });
      }
    }
    pages.push(blocks);
  }
  return pages;
}

// Join a cell's lines. Wrapped names are glued back together ("D. Sim-" +
// "mons" -> "D. Simmons", "A." + "Kunduru" -> "A. Kunduru", "Garrotto" +
// "(PM)"); otherwise each line is a separate list, so keep a "; " boundary
// rather than running names together.
function joinCellLines(lines: string[]): string {
  let out = "";
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (!out) out = t;
    else if (/[a-z]-$/.test(out) && /^[a-z]/.test(t)) out = out.slice(0, -1) + t;
    else if (/([/:]|\b[A-Z][a-z]?\.)$/.test(out) || /^[(a-z]/.test(t)) out += " " + t;
    else out += "; " + t;
  }
  return out;
}

const tol = 2; // points

/**
 * Returns a normalised plain-text roster (one block per day) or null if no
 * roster table is found in the PDF.
 */
export async function extractDutyRosterText(pdf: Buffer): Promise<string | null> {
  const xhtml = await withTempPdf(pdf, (p) => pdftotext(["-bbox-layout", "-enc", "UTF-8", p, "-"]));
  const pages = parseBboxLayout(xhtml);

  type Day = { date: string; weekday: string; cells: Map<string, Box[]> };
  const days: Day[] = [];
  let month: { y: number; m: number } | null = null; // carries across pages
  let columnX: { name: string; x: number }[] | null = null;

  for (const blocks of pages) {
    const single = (b: Box) => (b.lines.length === 1 ? b.lines[0].trim() : null);

    // Month headers ("26-Oct") sit on the same baseline as a "Rangemaster" header.
    const headers = blocks
      .filter((b) => {
        const m = single(b)?.match(/^(\d{2})-([A-Z][a-z]{2})$/);
        return !!m && MONTHS.includes(m[2]) &&
          blocks.some((o) => single(o) === "Rangemaster" && Math.abs(o.yMax - b.yMax) < tol);
      })
      .map((b) => {
        const [yy, mon] = single(b)!.split("-");
        return { yMax: b.yMax, y: 2000 + Number(yy), m: MONTHS.indexOf(mon) + 1 };
      })
      .sort((a, b) => a.yMax - b.yMax);
    if (headers.length) {
      const hy = headers[0].yMax;
      columnX = COLUMNS.map((name) => {
        const h = blocks.find((b) => single(b) === name && Math.abs(b.yMax - hy) < tol);
        return h ? { name, x: h.xMin } : null;
      }).filter((c): c is { name: string; x: number } => !!c);
    }
    if (!month && !headers.length) continue; // no roster yet on this page
    // On the page where the roster starts, anything above its first header is
    // unrelated content; on continuation pages the top rows are roster cells.
    const topCutoff = month ? -Infinity : headers[0].yMax;

    // Day labels: a 1–2 digit number with a weekday block on the same baseline.
    const labels = blocks
      .filter((b) => /^\d{1,2}$/.test(single(b) ?? ""))
      .map((b) => {
        const wd = blocks.find(
          (o) => WEEKDAYS.has(single(o) ?? "") && Math.abs(o.yMax - b.yMax) < tol && o.xMin > b.xMax,
        );
        return wd ? { day: Number(single(b)), weekday: single(wd)!, yMax: b.yMax, xMax: wd.xMax } : null;
      })
      .filter((l): l is NonNullable<typeof l> => !!l)
      .sort((a, b) => a.yMax - b.yMax);
    if (!labels.length || !columnX?.length) {
      month = null; // roster ended; don't misread later pages as continuations
      continue;
    }

    const pageDays = labels.map((l) => {
      const hdr = [...headers].reverse().find((h) => h.yMax < l.yMax);
      if (hdr) month = { y: hdr.y, m: hdr.m };
      if (!month) return null;
      const date = `${month.y}-${String(month.m).padStart(2, "0")}-${String(l.day).padStart(2, "0")}`;
      const day: Day = { date, weekday: l.weekday, cells: new Map() };
      days.push(day);
      return { ...l, day };
    });

    const labelRight = Math.max(...labels.map((l) => l.xMax));
    for (const b of blocks) {
      if (b.xMin <= labelRight) continue; // the label column itself
      if (b.yMax <= topCutoff) continue;
      if (headers.some((h) => Math.abs(h.yMax - b.yMax) < tol)) continue; // header row
      const owner = pageDays.find((d) => d && d.yMax >= b.yMax - tol);
      if (!owner) continue;
      const col = [...columnX].reverse().find((c) => c.x <= b.xMin + tol);
      if (!col) continue;
      const list = owner.day.cells.get(col.name) ?? [];
      list.push(b);
      owner.day.cells.set(col.name, list);
    }
  }

  if (!days.length) return null;

  const out: string[] = [];
  for (const d of days) {
    if (!d.cells.size) continue; // e.g. Fridays / no-shooting Sundays with nobody listed
    out.push(`${d.date} (${d.weekday})`);
    for (const name of COLUMNS) {
      const cell = (d.cells.get(name) ?? []).sort((a, b) => a.yMin - b.yMin || a.xMin - b.xMin);
      const text = cell.map((b) => joinCellLines(b.lines)).join(" | ");
      out.push(`  ${name}: ${text || "(empty)"}`);
    }
  }
  return out.length ? out.join("\n") : null;
}
