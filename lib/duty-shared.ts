// Pure types + helpers for range-duty roster.
// File I/O lives in lib/duty.ts (server-only).

import { z } from "zod";

export const DutyAssignmentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  role: z.string(),                     // "RM" | "Cashier" | "RSO" | "Trap Captain" | "Trap Officer" | "5-Stand" | "ATA Captain" | "ATA Officer" | "Office"
  ampm: z.enum(["AM", "PM", "ALL"]).nullable(),
  rawName: z.string(),                  // verbatim from newsletter, e.g. "S. Syed"
});
export type DutyAssignment = z.infer<typeof DutyAssignmentSchema>;

export const DutyMonthFileSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  source: z.string().optional(),
  uploadedAt: z.string(),
  assignments: z.array(DutyAssignmentSchema),
});
export type DutyMonthFile = z.infer<typeof DutyMonthFileSchema>;

// Parse "F. LastName", "Fi LastName", "F.LastName", "F. Vander Wal",
// "F. Frink, Jr." → { initial, last }. Tolerates one or two-letter initials,
// optional dot, multi-word last names, and trailing suffixes (Jr, Sr, II, III)
// which are stripped from the last-name comparison.
const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv"]);
export function parseRosterName(raw: string): { initial: string; last: string } | null {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  const m = cleaned.match(/^([A-Za-z]{1,2})\.?\s+(.+)$/);
  if (!m) return null;
  const initial = m[1].charAt(0).toUpperCase();
  // Strip trailing suffix tokens (Jr, Jr., Sr, II, III, IV — comma optional).
  const tokens = m[2].split(/\s+/).map((t) => t.replace(/,$/, ""));
  while (tokens.length > 1 && SUFFIXES.has(tokens[tokens.length - 1].toLowerCase())) {
    tokens.pop();
  }
  const last = tokens.join(" ").replace(/,$/, "").trim();
  if (!last) return null;
  return { initial, last };
}

function normalizeLast(s: string): string {
  let out = s.trim().toLowerCase();
  // Strip trailing suffix (Jr, Sr, II, III, IV) optionally preceded by a comma.
  out = out.replace(/[\s,]+(jr\.?|sr\.?|ii|iii|iv)$/i, "");
  return out.replace(/\s+/g, " ").trim();
}

// Strict: same last name AND same first-initial. Loose: last name only.
export function matchesMember(
  rawName: string,
  member: { firstName: string; lastName: string },
): { strict: boolean; loose: boolean } {
  const parsed = parseRosterName(rawName);
  if (!parsed) return { strict: false, loose: false };
  const lastMatch = normalizeLast(parsed.last) === normalizeLast(member.lastName);
  const initialMatch =
    parsed.initial.toUpperCase() === member.firstName.charAt(0).toUpperCase();
  return { strict: lastMatch && initialMatch, loose: lastMatch };
}
