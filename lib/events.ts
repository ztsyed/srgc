import "server-only";
import fs from "node:fs/promises";
import { EVENTS_DIR, RECURRING_PATH, ensureDataDirs, eventsJsonPath } from "./paths";
import { type DayEvent, type EventRow, type RecurringRow, RecurringRowSchema, EventRowSchema } from "./types";
import { deriveVenue } from "./venue";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function monthKey(d: Date): string {
  return isoDate(d).slice(0, 7);
}

export async function loadRecurring(): Promise<RecurringRow[]> {
  await ensureDataDirs();
  const raw = await fs.readFile(RECURRING_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return RecurringRowSchema.array().parse(parsed);
}

export async function loadMonth(month: string): Promise<EventRow[]> {
  await ensureDataDirs();
  try {
    const raw = await fs.readFile(eventsJsonPath(month), "utf8");
    const arr = EventRowSchema.array().parse(JSON.parse(raw));
    return arr.map((r) => ({ ...r, venue: deriveVenue(r.event, r.exUse) }));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

export async function listIngestedMonths(): Promise<string[]> {
  await ensureDataDirs();
  const files = await fs.readdir(EVENTS_DIR);
  return files
    .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 7))
    .sort();
}

function nthDayOfMonth(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

export function matchesRecurrence(rule: RecurringRow, date: Date): boolean {
  const wd = WEEKDAYS[date.getDay()];
  if (rule.weekday !== wd) return false;
  if (rule.ordinal === "every") return true;
  const n = nthDayOfMonth(date);
  if (n === rule.ordinal) return true;
  if (rule.ordinalSecond && n === rule.ordinalSecond) return true;
  return false;
}

export async function eventsForDate(date: Date): Promise<DayEvent[]> {
  const [recurring, monthly] = await Promise.all([loadRecurring(), loadMonth(monthKey(date))]);
  const day = isoDate(date);

  const month: DayEvent[] = monthly
    .filter((e) => e.date === day)
    .map((e) => ({
      source: "monthly",
      from: e.from,
      to: e.to,
      event: e.event,
      venue: e.venue,
      exUse: e.exUse || undefined,
      contact: e.contact || undefined,
    }));

  // Dedupe: drop a recurring entry only if a monthly entry on the same
  // venue starts within 5 minutes AND shares at least one significant word
  // with the recurring event name. This prevents an unrelated one-off
  // championship from masking the regular weekly league.
  function timeMins(t: string): number {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }
  function tokens(name: string): Set<string> {
    return new Set(
      name.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length >= 4) ?? [],
    );
  }
  function isDuplicate(rule: RecurringRow): boolean {
    const rt = timeMins(rule.time);
    const rTokens = tokens(rule.event);
    return month.some((e) => {
      if (e.venue !== rule.venue) return false;
      if (Math.abs(timeMins(e.from) - rt) > 5) return false;
      const eTokens = tokens(e.event);
      for (const t of rTokens) if (eTokens.has(t)) return true;
      return false;
    });
  }

  const recur: DayEvent[] = recurring
    .filter((r) => matchesRecurrence(r, date))
    .filter((r) => !isDuplicate(r))
    .map((r) => ({
      source: "recurring",
      from: r.time,
      event: r.event,
      venue: r.venue,
    }));

  return [...recur, ...month].sort((a, b) => a.from.localeCompare(b.from));
}

// Aggregate events across an arbitrary date range. Used for the ICS feed.
export async function eventsBetween(start: Date, end: Date): Promise<Array<{ date: string; events: DayEvent[] }>> {
  const out: Array<{ date: string; events: DayEvent[] }> = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const stop = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= stop) {
    const events = await eventsForDate(cursor);
    if (events.length > 0) out.push({ date: isoDate(cursor), events });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

// For the calendar grid: which days in the month have at least one event,
// and which venues are represented. Loads recurring + monthly once.
export async function monthEventMap(year: number, monthIdx0: number): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  const last = new Date(year, monthIdx0 + 1, 0).getDate();
  const ym = `${year}-${String(monthIdx0 + 1).padStart(2, "0")}`;
  const [recurring, monthly] = await Promise.all([loadRecurring(), loadMonth(ym)]);

  const monthlyByDate = new Map<string, EventRow[]>();
  for (const e of monthly) {
    const arr = monthlyByDate.get(e.date) ?? [];
    arr.push(e);
    monthlyByDate.set(e.date, arr);
  }

  for (let d = 1; d <= last; d++) {
    const date = new Date(year, monthIdx0, d);
    const day = isoDate(date);
    const venues = new Set<string>();
    for (const r of recurring) if (matchesRecurrence(r, date)) venues.add(r.venue);
    for (const e of monthlyByDate.get(day) ?? []) venues.add(e.venue);
    if (venues.size > 0) result.set(day, venues);
  }
  return result;
}
