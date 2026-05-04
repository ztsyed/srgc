import "server-only";
import { auth } from "./auth";
import { loadMembersFile } from "./members";
import type { Member } from "./members-shared";

export async function getCurrentMember(): Promise<Member | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;
  const file = await loadMembersFile();
  if (!file) return null;
  // Primary match: email.
  const byEmail = file.members.find((m) => m.email.toLowerCase() === email);
  if (byEmail) return byEmail;
  // Fallback: full-name match against the OAuth display name.
  const name = session?.user?.name?.toLowerCase().trim();
  if (name) {
    const byName = file.members.find((m) =>
      `${m.firstName} ${m.lastName}`.toLowerCase() === name ||
      `${m.lastName}, ${m.firstName}`.toLowerCase() === name,
    );
    if (byName) return byName;
  }
  return null;
}

// Compute the next occurrence of a recurring event from `from` (inclusive).
// Returns null only if `maxLookaheadDays` exhausts without a match (shouldn't happen for weekly events).
export function nextRecurrence(
  from: Date,
  weekday: number,         // 0..6 Sun..Sat
  ordinal: "every" | number,
  maxLookaheadDays = 60,
): Date | null {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < maxLookaheadDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d.getDay() !== weekday) continue;
    if (ordinal === "every") return d;
    if (Math.ceil(d.getDate() / 7) === ordinal) return d;
  }
  return null;
}
