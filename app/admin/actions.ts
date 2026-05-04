"use server";

import { promises as fs } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { parseNewsletter, parseDutyRoster } from "@/lib/claude";
import { writeDutyMonth } from "@/lib/duty";
import type { DutyAssignment } from "@/lib/duty-shared";
import { parseMembersCsv, writeMembersFile } from "@/lib/members";
import {
  HANDBOOK_PATH,
  PDF_DIR,
  ensureDataDirs,
  eventsJsonPath,
  newsletterPdfPath,
} from "@/lib/paths";

async function requireAuth() {
  const s = await auth();
  if (!s?.user) throw new Error("Unauthorized");
}

export async function uploadNewsletter(formData: FormData): Promise<{ ok: boolean; message: string; month?: string }> {
  await requireAuth();
  await ensureDataDirs();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "No file provided." };
  }
  const explicitMonth = (formData.get("month") as string | null)?.trim();
  if (explicitMonth && !/^\d{4}-\d{2}$/.test(explicitMonth)) {
    return { ok: false, message: "Month override must be YYYY-MM." };
  }
  const buf = Buffer.from(await file.arrayBuffer());

  const month = explicitMonth || guessMonthFromFilename(file.name);
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return { ok: false, message: "Couldn't determine month from filename. Provide it manually (YYYY-MM)." };
  }

  await fs.writeFile(newsletterPdfPath(month), buf);

  try {
    const parsed = await parseNewsletter(buf, file.name);
    const finalMonth = explicitMonth || (/^\d{4}-\d{2}$/.test(parsed.month) ? parsed.month : month);
    // Write the events JSON FIRST. Only after that succeeds do we rename the
    // PDF — if the rename fails we still have the data, and if the events
    // write fails we haven't moved the PDF away from where we just put it.
    await fs.writeFile(eventsJsonPath(finalMonth), JSON.stringify(parsed.events, null, 2));
    if (finalMonth !== month) {
      await fs.rename(newsletterPdfPath(month), newsletterPdfPath(finalMonth));
    }

    // Best-effort duty extraction from the same PDF — doesn't block the upload result.
    let dutyMessage = "";
    try {
      const duty = await parseDutyRoster(buf, file.name);
      const written = await writeDutyFromParsed(duty, file.name);
      dutyMessage = ` Duty: ${written.totalAssignments} assignments across ${written.months.join(", ")}.`;
    } catch (e) {
      dutyMessage = ` Duty parse skipped: ${(e as Error).message}`;
    }

    revalidatePath("/admin");
    revalidatePath("/");
    revalidatePath("/calendar");
    return {
      ok: true,
      message: `Parsed ${parsed.events.length} events for ${finalMonth}.${dutyMessage}`,
      month: finalMonth,
    };
  } catch (e) {
    return { ok: false, message: `Saved PDF but parse failed: ${(e as Error).message}` };
  }
}

async function writeDutyFromParsed(
  duty: { months: string[]; assignments: DutyAssignment[] },
  source: string,
): Promise<{ months: string[]; skippedMonths: string[]; totalAssignments: number }> {
  // Group assignments by month and write one file per month.
  const byMonth = new Map<string, DutyAssignment[]>();
  for (const a of duty.assignments) {
    const key = a.date.slice(0, 7);
    const arr = byMonth.get(key) ?? [];
    arr.push(a);
    byMonth.set(key, arr);
  }
  const writtenMonths: string[] = [];
  const skippedMonths: string[] = [];
  const uploadedAt = new Date().toISOString();
  for (const month of duty.months) {
    const assignments = (byMonth.get(month) ?? []).sort((a, b) =>
      a.date === b.date ? a.role.localeCompare(b.role) : a.date.localeCompare(b.date),
    );
    if (assignments.length === 0) {
      skippedMonths.push(month);
      continue;
    }
    await writeDutyMonth({ month, source, uploadedAt, assignments });
    writtenMonths.push(month);
  }
  return {
    months: writtenMonths,
    skippedMonths,
    totalAssignments: duty.assignments.length,
  };
}

export async function reparseDuty(month: string): Promise<{ ok: boolean; message: string }> {
  await requireAuth();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "Bad month." };
  try {
    const buf = await fs.readFile(newsletterPdfPath(month));
    const duty = await parseDutyRoster(buf, `${month}.pdf`);
    const written = await writeDutyFromParsed(duty, `${month}.pdf`);
    revalidatePath("/admin");
    revalidatePath("/");
    const skipNote = written.skippedMonths.length
      ? ` (parser found nothing for ${written.skippedMonths.join(", ")} — old data for those months is preserved)`
      : "";
    return {
      ok: true,
      message: `Duty: ${written.totalAssignments} assignments across ${written.months.join(", ")}${skipNote}.`,
    };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function reparseMonth(month: string): Promise<{ ok: boolean; message: string }> {
  await requireAuth();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "Bad month." };
  try {
    const buf = await fs.readFile(newsletterPdfPath(month));
    const parsed = await parseNewsletter(buf, `${month}.pdf`);
    await fs.writeFile(eventsJsonPath(month), JSON.stringify(parsed.events, null, 2));
    revalidatePath("/admin");
    revalidatePath("/");
    revalidatePath("/calendar");
    return { ok: true, message: `Re-parsed ${parsed.events.length} events for ${month}.` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function deleteMonth(month: string): Promise<{ ok: boolean; message: string }> {
  await requireAuth();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "Bad month." };
  await fs.rm(eventsJsonPath(month), { force: true });
  await fs.rm(newsletterPdfPath(month), { force: true });
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/calendar");
  return { ok: true, message: `Removed ${month}.` };
}

export async function uploadMembersCsv(formData: FormData): Promise<{ ok: boolean; message: string }> {
  await requireAuth();
  await ensureDataDirs();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "No file provided." };
  }
  const text = await file.text();
  try {
    const { members, warnings } = parseMembersCsv(text);
    if (members.length === 0) {
      return { ok: false, message: "No members parsed. Check column headers." };
    }
    await writeMembersFile(members, file.name);
    revalidatePath("/members");
    revalidatePath("/admin");
    const warn = warnings.length ? ` (${warnings.length} warnings)` : "";
    return { ok: true, message: `Loaded ${members.length} members${warn}.` };
  } catch (e) {
    return { ok: false, message: `Parse failed: ${(e as Error).message}` };
  }
}

export async function uploadHandbook(formData: FormData): Promise<{ ok: boolean; message: string }> {
  await requireAuth();
  await ensureDataDirs();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "No file provided." };
  }
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(HANDBOOK_PATH, buf);
  revalidatePath("/handbook");
  revalidatePath("/admin");
  return { ok: true, message: `Handbook updated (${(buf.length / 1024).toFixed(0)} KB).` };
}

function guessMonthFromFilename(name: string): string | null {
  const base = path.basename(name).toLowerCase();
  // Pattern A: SVRGC-MMYYYY.pdf  e.g. svrgc-032026.pdf
  let m = base.match(/(\d{2})(\d{4})\.pdf$/);
  if (m) return `${m[2]}-${m[1]}`;
  // Pattern B: anywhere YYYY-MM
  m = base.match(/(\d{4})[-_](\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  // Pattern C: month name + year
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  m = base.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-_\s]*(\d{4})/);
  if (m) {
    const idx = months.indexOf(m[1]);
    return `${m[2]}-${String(idx + 1).padStart(2, "0")}`;
  }
  return null;
}
