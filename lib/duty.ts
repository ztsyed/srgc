import "server-only";
import { promises as fs } from "node:fs";
import {
  DutyMonthFileSchema,
  matchesMember,
  type DutyAssignment,
  type DutyMonthFile,
} from "./duty-shared";
import { DUTY_DIR, dutyJsonPath, ensureDataDirs } from "./paths";

export {
  DutyAssignmentSchema,
  DutyMonthFileSchema,
  matchesMember,
  parseRosterName,
} from "./duty-shared";
export type { DutyAssignment, DutyMonthFile } from "./duty-shared";

export async function writeDutyMonth(file: DutyMonthFile): Promise<void> {
  await ensureDataDirs();
  await fs.writeFile(dutyJsonPath(file.month), JSON.stringify(file, null, 2));
}

export async function loadDutyMonth(month: string): Promise<DutyMonthFile | null> {
  await ensureDataDirs();
  try {
    const raw = await fs.readFile(dutyJsonPath(month), "utf8");
    return DutyMonthFileSchema.parse(JSON.parse(raw));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export async function listDutyMonths(): Promise<string[]> {
  await ensureDataDirs();
  const files = await fs.readdir(DUTY_DIR);
  return files
    .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 7))
    .sort();
}

export type NextDutyResult = {
  assignment: DutyAssignment;
  strict: boolean;             // true = last name + first initial match; false = last name only
};

export async function findNextDutyForMember(
  member: { firstName: string; lastName: string },
  fromDate: Date,
): Promise<NextDutyResult | null> {
  const fromIso = isoLocal(fromDate);
  const currentMonth = fromIso.slice(0, 7);
  const months = (await listDutyMonths()).filter((m) => m >= currentMonth).sort();

  // Walk all months in order. Keep the earliest strict and earliest loose
  // candidates seen so far. Strict wins globally — we only fall back to
  // loose if no strict match exists in any month.
  let strict: NextDutyResult | null = null;
  let loose: NextDutyResult | null = null;
  for (const month of months) {
    const file = await loadDutyMonth(month);
    if (!file) continue;
    const sorted = [...file.assignments].sort((a, b) => a.date.localeCompare(b.date));
    for (const a of sorted) {
      if (a.date < fromIso) continue;
      const m = matchesMember(a.rawName, member);
      if (m.strict && !strict) strict = { assignment: a, strict: true };
      else if (m.loose && !loose) loose = { assignment: a, strict: false };
      if (strict) break;                 // Earliest strict wins; stop scanning.
    }
    if (strict) break;
  }
  return strict ?? loose;
}

function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
