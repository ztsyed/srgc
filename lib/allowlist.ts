import "server-only";
import { promises as fs } from "node:fs";
import { z } from "zod";
import { ALLOWLIST_PATH, ensureDataDirs } from "./paths";

export const AllowlistEntrySchema = z.object({
  email: z.string(),
  name: z.string().optional(),
  approvedAt: z.string(),
  approvedBy: z.string().optional(),
});
export const AllowlistFileSchema = z.object({
  updatedAt: z.string(),
  entries: z.array(AllowlistEntrySchema),
});
export type AllowlistEntry = z.infer<typeof AllowlistEntrySchema>;
export type AllowlistFile = z.infer<typeof AllowlistFileSchema>;

function envSeed(): string[] {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function readAllowlistFile(): Promise<AllowlistFile | null> {
  try {
    const raw = await fs.readFile(ALLOWLIST_PATH, "utf8");
    return AllowlistFileSchema.parse(JSON.parse(raw));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

async function writeAllowlistFile(file: AllowlistFile): Promise<void> {
  await fs.writeFile(ALLOWLIST_PATH, JSON.stringify(file, null, 2));
}

// Migrate ALLOWED_EMAILS → allowlist.json on first read. After this, the env
// var is ignored; the file is the source of truth.
export async function loadAllowlist(): Promise<AllowlistFile> {
  await ensureDataDirs();
  const existing = await readAllowlistFile();
  if (existing) return existing;
  const now = new Date().toISOString();
  const seeded: AllowlistFile = {
    updatedAt: now,
    entries: envSeed().map((email) => ({ email, approvedAt: now, approvedBy: "bootstrap" })),
  };
  await writeAllowlistFile(seeded);
  return seeded;
}

export async function isAllowed(email: string): Promise<boolean> {
  const file = await loadAllowlist();
  const lower = email.toLowerCase();
  return file.entries.some((e) => e.email === lower);
}

export async function addToAllowlist(
  entry: { email: string; name?: string; approvedBy?: string },
): Promise<void> {
  const file = await loadAllowlist();
  const lower = entry.email.toLowerCase();
  if (file.entries.some((e) => e.email === lower)) return;
  const now = new Date().toISOString();
  file.entries.push({
    email: lower,
    name: entry.name,
    approvedAt: now,
    approvedBy: entry.approvedBy,
  });
  file.entries.sort((a, b) => a.email.localeCompare(b.email));
  file.updatedAt = now;
  await writeAllowlistFile(file);
}

export async function removeFromAllowlist(email: string): Promise<void> {
  const file = await loadAllowlist();
  const lower = email.toLowerCase();
  const before = file.entries.length;
  file.entries = file.entries.filter((e) => e.email !== lower);
  if (file.entries.length === before) return;
  file.updatedAt = new Date().toISOString();
  await writeAllowlistFile(file);
}
