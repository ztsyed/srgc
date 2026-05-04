import "server-only";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NOTIFICATIONS_PATH, ensureDataDirs } from "./paths";

export const NotificationSchema = z.object({
  id: z.string(),
  userEmail: z.string().email(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  eventTitle: z.string().min(1).max(200),
  eventTime: z.string().regex(/^\d{2}:\d{2}$/),       // HH:MM start time
  venue: z.string().max(40),
  createdAt: z.string(),
  sentAt: z.string().nullable(),
  failedAt: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional(),
});
export type Notification = z.infer<typeof NotificationSchema>;

async function loadAll(): Promise<Notification[]> {
  await ensureDataDirs();
  try {
    const raw = await fs.readFile(NOTIFICATIONS_PATH, "utf8");
    return NotificationSchema.array().parse(JSON.parse(raw));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

async function saveAll(notifications: Notification[]): Promise<void> {
  await ensureDataDirs();
  await fs.writeFile(NOTIFICATIONS_PATH, JSON.stringify(notifications, null, 2));
}

const MAX_PENDING_PER_USER = 200;

export async function addNotification(
  input: Omit<Notification, "id" | "createdAt" | "sentAt">,
): Promise<Notification> {
  const all = await loadAll();
  // De-dupe: if user already has a pending notification for the same event on
  // the same date, return the existing one.
  const dup = all.find(
    (n) =>
      n.sentAt === null &&
      n.userEmail === input.userEmail &&
      n.eventDate === input.eventDate &&
      n.eventTime === input.eventTime &&
      n.eventTitle === input.eventTitle,
  );
  if (dup) return dup;
  // Cap: bound `notifications.json` growth even if a logged-in client misbehaves.
  const pendingForUser = all.filter((n) => n.userEmail === input.userEmail && n.sentAt === null).length;
  if (pendingForUser >= MAX_PENDING_PER_USER) {
    throw new Error(`Pending notification limit reached (${MAX_PENDING_PER_USER}). Cancel some on /settings.`);
  }
  const fresh: Notification = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    sentAt: null,
  };
  all.push(fresh);
  await saveAll(all);
  return fresh;
}

export async function listNotificationsForUser(email: string): Promise<Notification[]> {
  const all = await loadAll();
  return all
    .filter((n) => n.userEmail === email)
    .sort((a, b) =>
      a.eventDate === b.eventDate ? a.eventTime.localeCompare(b.eventTime) : a.eventDate.localeCompare(b.eventDate),
    );
}

export async function deleteNotification(id: string, email: string): Promise<boolean> {
  const all = await loadAll();
  const next = all.filter((n) => !(n.id === id && n.userEmail === email));
  if (next.length === all.length) return false;
  await saveAll(next);
  return true;
}

export async function dueToday(today: string): Promise<Notification[]> {
  const all = await loadAll();
  return all.filter((n) => n.sentAt === null && n.eventDate === today);
}

export async function markSent(id: string, sentAt: string): Promise<void> {
  const all = await loadAll();
  for (const n of all) if (n.id === id) { n.sentAt = sentAt; n.failedAt = null; n.failureReason = null; }
  await saveAll(all);
}

export async function markFailed(id: string, reason: string): Promise<void> {
  const all = await loadAll();
  for (const n of all) if (n.id === id) { n.failedAt = new Date().toISOString(); n.failureReason = reason; }
  await saveAll(all);
}

// Garbage-collect notifications whose event date is more than `keepDays` in the
// past. Keep:
//   - anything whose event date is recent enough, OR
//   - anything still genuinely waiting to fire (sentAt and failedAt both null).
// Drop notifications that have been attempted (sent or failed) and are old.
export async function pruneOld(keepDays = 30): Promise<number> {
  const all = await loadAll();
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const next = all.filter(
    (n) => n.eventDate >= cutoffIso || (n.sentAt === null && !n.failedAt),
  );
  await saveAll(next);
  return all.length - next.length;
}
