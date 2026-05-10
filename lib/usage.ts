import "server-only";
import fs from "node:fs/promises";
import { ensureDataDirs, USAGE_DIR, usagePath } from "./paths";
import { isAdmin } from "./auth";

export type UsageKind = "page" | "newsletter" | "ics" | "handbook" | "calendar-feed";

export type UsageEntry = {
  ts: string;            // ISO 8601 UTC
  email: string;
  name: string | null;
  kind: UsageKind;
  path: string;
  detail?: string;       // e.g. event title for ICS, month for newsletter
};

function monthKeyUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Append a single usage line. Skips admins by design — the user explicitly
// asked to track everyone *except* themselves. Failures are swallowed: a log
// write must never break the user's flow.
export async function logUsage(entry: {
  email: string | null | undefined;
  name?: string | null;
  kind: UsageKind;
  path: string;
  detail?: string;
}): Promise<void> {
  try {
    const email = entry.email?.toLowerCase().trim();
    if (!email) return;
    if (isAdmin(email)) return;
    await ensureDataDirs();
    const now = new Date();
    const line: UsageEntry = {
      ts: now.toISOString(),
      email,
      name: entry.name ?? null,
      kind: entry.kind,
      path: entry.path.slice(0, 500),
      detail: entry.detail?.slice(0, 200),
    };
    await fs.appendFile(usagePath(monthKeyUtc(now)), JSON.stringify(line) + "\n", "utf8");
  } catch {
    // intentionally swallowed
  }
}

// Read recent usage entries. Reads the requested months in order and returns
// the entries newest-first. Skips files that don't exist.
export async function readUsage(months: string[]): Promise<UsageEntry[]> {
  await ensureDataDirs();
  const out: UsageEntry[] = [];
  for (const m of months) {
    let raw: string;
    try {
      raw = await fs.readFile(usagePath(m), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw e;
    }
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as UsageEntry);
      } catch {
        // skip malformed line
      }
    }
  }
  out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return out;
}

// Build a list of YYYY-MM keys ending at `now` and going `count` months back.
export function recentMonths(now: Date, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// Re-export for callers that need the directory (e.g. cleanup scripts).
export { USAGE_DIR };
