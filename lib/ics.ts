// iCalendar (RFC 5545) generator. Pure — safe to import from anywhere.
import { createHash } from "node:crypto";

export type IcsEvent = {
  uid: string;
  date: string;        // YYYY-MM-DD
  start: string;       // HH:MM (local club time, treated as floating but tagged America/Los_Angeles)
  end?: string;        // HH:MM
  summary: string;
  description?: string;
  location?: string;
  url?: string;
};

const TZID = "America/Los_Angeles";

function fold(line: string): string {
  // RFC 5545 §3.1: lines must be at most 75 octets, continuation starts with single space.
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    out.push((i === 0 ? "" : " ") + line.slice(i, i + 73));
    i += 73;
  }
  return out.join("\r\n");
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
}

function dtLocal(date: string, time: string): string {
  // "20260507T190000" — floating time tagged with TZID parameter.
  const [y, m, d] = date.split("-");
  const [h, min] = time.split(":");
  return `${y}${m}${d}T${h}${min}00`;
}

function nowUtcStamp(): string {
  const d = new Date();
  const z = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getUTCFullYear()}${z(d.getUTCMonth() + 1)}${z(d.getUTCDate())}T${z(d.getUTCHours())}${z(d.getUTCMinutes())}${z(d.getUTCSeconds())}Z`;
}

export function eventUid(date: string, time: string, summary: string, host = "srgc.local"): string {
  const h = createHash("sha1").update(`${date}|${time}|${summary}`).digest("hex").slice(0, 16);
  return `${h}@${host}`;
}

export function buildIcs(calName: string, events: IcsEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SRGC Companion//srgc-app//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calName)}`,
    `X-WR-TIMEZONE:${TZID}`,
    // Minimal VTIMEZONE for America/Los_Angeles — most clients fall back to
    // their own tz database on this TZID, so we keep it brief.
    "BEGIN:VTIMEZONE",
    `TZID:${TZID}`,
    "BEGIN:STANDARD",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "TZOFFSETFROM:-0700",
    "TZOFFSETTO:-0800",
    "TZNAME:PST",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "TZOFFSETFROM:-0800",
    "TZOFFSETTO:-0700",
    "TZNAME:PDT",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
  ];

  const stamp = nowUtcStamp();
  for (const e of events) {
    const end = e.end ?? addOneHour(e.start);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${TZID}:${dtLocal(e.date, e.start)}`,
      `DTEND;TZID=${TZID}:${dtLocal(e.date, end)}`,
      `SUMMARY:${escapeText(e.summary)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.url) lines.push(`URL:${escapeText(e.url)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + 60;
  const hh = Math.floor((total / 60) % 24);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
