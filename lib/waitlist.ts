import "server-only";
import { promises as fs } from "node:fs";
import { z } from "zod";
import { WAITLIST_PATH, ensureDataDirs } from "./paths";

export const WaitlistEntrySchema = z.object({
  email: z.string(),
  name: z.string().optional(),
  image: z.string().optional(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  attemptCount: z.number().int().nonnegative(),
});
export const WaitlistFileSchema = z.object({
  updatedAt: z.string(),
  entries: z.array(WaitlistEntrySchema),
});
export type WaitlistEntry = z.infer<typeof WaitlistEntrySchema>;
export type WaitlistFile = z.infer<typeof WaitlistFileSchema>;

const EMPTY: WaitlistFile = { updatedAt: new Date(0).toISOString(), entries: [] };

export async function loadWaitlist(): Promise<WaitlistFile> {
  await ensureDataDirs();
  try {
    const raw = await fs.readFile(WAITLIST_PATH, "utf8");
    return WaitlistFileSchema.parse(JSON.parse(raw));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { ...EMPTY };
    throw e;
  }
}

async function writeWaitlist(file: WaitlistFile): Promise<void> {
  await fs.writeFile(WAITLIST_PATH, JSON.stringify(file, null, 2));
}

export async function recordDenial(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<void> {
  const lower = input.email.toLowerCase();
  const file = await loadWaitlist();
  const now = new Date().toISOString();
  const existing = file.entries.find((e) => e.email === lower);
  if (existing) {
    existing.lastSeenAt = now;
    existing.attemptCount += 1;
    if (input.name) existing.name = input.name;
    if (input.image) existing.image = input.image;
  } else {
    file.entries.push({
      email: lower,
      name: input.name ?? undefined,
      image: input.image ?? undefined,
      firstSeenAt: now,
      lastSeenAt: now,
      attemptCount: 1,
    });
  }
  file.entries.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  file.updatedAt = now;
  await writeWaitlist(file);
}

export async function removeFromWaitlist(email: string): Promise<void> {
  const lower = email.toLowerCase();
  const file = await loadWaitlist();
  const before = file.entries.length;
  file.entries = file.entries.filter((e) => e.email !== lower);
  if (file.entries.length === before) return;
  file.updatedAt = new Date().toISOString();
  await writeWaitlist(file);
}

export async function waitlistCount(): Promise<number> {
  try {
    const file = await loadWaitlist();
    return file.entries.length;
  } catch {
    return 0;
  }
}
