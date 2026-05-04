import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { PREFS_DIR, ensureDataDirs } from "./paths";

export const UserPrefsSchema = z.object({
  email: z.string().email(),
  ntfyTopic: z.string().regex(/^[A-Za-z0-9_\-]+$/).max(64).optional().or(z.literal("")),
  ntfyServer: z.string().url().optional().or(z.literal("")),
  updatedAt: z.string(),
});
export type UserPrefs = z.infer<typeof UserPrefsSchema>;

function emailToFile(email: string): string {
  // Use a stable safe filename: hash isn't needed since we sanitize.
  const safe = email.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
  return path.join(PREFS_DIR, `${safe}.json`);
}

export async function loadPrefs(email: string): Promise<UserPrefs | null> {
  await ensureDataDirs();
  try {
    const raw = await fs.readFile(emailToFile(email), "utf8");
    return UserPrefsSchema.parse(JSON.parse(raw));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export async function savePrefs(prefs: Omit<UserPrefs, "updatedAt">): Promise<void> {
  await ensureDataDirs();
  const full: UserPrefs = { ...prefs, updatedAt: new Date().toISOString() };
  await fs.writeFile(emailToFile(prefs.email), JSON.stringify(full, null, 2));
}

export async function listAllPrefs(): Promise<UserPrefs[]> {
  await ensureDataDirs();
  const files = await fs.readdir(PREFS_DIR);
  const out: UserPrefs[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(PREFS_DIR, f), "utf8");
      out.push(UserPrefsSchema.parse(JSON.parse(raw)));
    } catch {}
  }
  return out;
}
