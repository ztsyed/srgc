"use server";

import { promises as fs } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { auth, isAdmin } from "@/lib/auth";
import { addToAllowlist, removeFromAllowlist } from "@/lib/allowlist";
import { removeFromWaitlist } from "@/lib/waitlist";
import { enqueueParseJob, isParseJobActive, listParseJobs, retryParseJob, type ParseJob } from "@/lib/parse-jobs";
import { parseMembersCsv, writeMembersFile } from "@/lib/members";
import {
  HANDBOOK_PATH,
  PDF_DIR,
  ensureDataDirs,
  eventsJsonPath,
  eventsMetaPath,
  newsletterPdfPath,
} from "@/lib/paths";

async function requireAdmin(): Promise<string> {
  const s = await auth();
  if (!s?.user?.email) throw new Error("Unauthorized");
  if (!isAdmin(s.user.email)) throw new Error("Forbidden");
  return s.user.email.toLowerCase();
}

export async function uploadNewsletter(formData: FormData): Promise<{ ok: boolean; message: string; month?: string }> {
  try {
    await requireAdmin();
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

    if (await isParseJobActive(month)) {
      return { ok: false, message: `${month} is still being parsed — wait for it to finish before re-uploading.` };
    }
    await fs.writeFile(newsletterPdfPath(month), buf);

    // Parsing takes minutes (longer on the local model), so it runs as a
    // background job with retries; the admin page polls its status.
    const queued = await enqueueParseJob({
      month,
      steps: ["events", "duty"],
      explicitMonth: !!explicitMonth,
      source: file.name,
    });
    revalidatePath("/admin");
    return { ...queued, message: `Saved PDF. ${queued.message}`, month };
  } catch (e) {
    return { ok: false, message: `Upload failed: ${(e as Error).message}` };
  }
}

export async function reparseDuty(month: string): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "Bad month." };
  return enqueueParseJob({ month, steps: ["duty"], explicitMonth: true, source: `${month}.pdf` });
}

export async function reparseMonth(month: string): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "Bad month." };
  return enqueueParseJob({ month, steps: ["events"], explicitMonth: true, source: `${month}.pdf` });
}

export async function retryParse(month: string): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "Bad month." };
  return retryParseJob(month);
}

export async function getParseJobs(): Promise<ParseJob[]> {
  await requireAdmin();
  return listParseJobs();
}

export async function deleteMonth(month: string): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "Bad month." };
  await fs.rm(eventsJsonPath(month), { force: true });
  await fs.rm(eventsMetaPath(month), { force: true });
  await fs.rm(newsletterPdfPath(month), { force: true });
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/calendar");
  return { ok: true, message: `Removed ${month}.` };
}

export async function uploadMembersCsv(formData: FormData): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
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
  await requireAdmin();
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

export async function approveWaitlistEntry(email: string): Promise<{ ok: boolean; message: string }> {
  try {
    const adminEmail = await requireAdmin();
    if (!email) return { ok: false, message: "Missing email." };
    await addToAllowlist({ email, approvedBy: adminEmail });
    await removeFromWaitlist(email);
    revalidatePath("/admin");
    return { ok: true, message: `Approved ${email}.` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function denyWaitlistEntry(email: string): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin();
    if (!email) return { ok: false, message: "Missing email." };
    await removeFromWaitlist(email);
    revalidatePath("/admin");
    return { ok: true, message: `Removed ${email} from waitlist.` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function removeAllowedEntry(email: string): Promise<{ ok: boolean; message: string }> {
  try {
    const adminEmail = await requireAdmin();
    if (!email) return { ok: false, message: "Missing email." };
    if (email.toLowerCase() === adminEmail) {
      return { ok: false, message: "You can't remove your own access." };
    }
    await removeFromAllowlist(email);
    revalidatePath("/admin");
    return { ok: true, message: `Removed ${email}.` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
