// Pure helpers + types — safe to import from client components.
// File I/O and CSV parsing live in lib/members.ts (server-only).

import { z } from "zod";

export const MemberSchema = z.object({
  id: z.string(),
  profileUrl: z
    .string()
    .url()
    .refine(
      (u) => u.startsWith("https://www.sunnyvalegunclub.com/"),
      "profileUrl must be a sunnyvalegunclub.com URL",
    ),
  membershipLevel: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string(),
  joinDate: z.string(),
  workPartyMonth: z.string(),
  rangeDuty: z.string(),
  rangeDutyAMPM: z.string(),
  rangeDutyDay: z.string(),
  clickerNumber: z.string(),
  subStatus: z.string(),
  organization: z.string(),
});
export type Member = z.infer<typeof MemberSchema>;

export const MembersFileSchema = z.object({
  uploadedAt: z.string(),
  source: z.string().optional(),
  members: z.array(MemberSchema),
});
export type MembersFile = z.infer<typeof MembersFileSchema>;

export function searchMembers(members: Member[], query: string): Member[] {
  const q = query.trim().toLowerCase();
  if (!q) return members;
  const qDigits = q.replace(/\D/g, "");
  return members.filter((m) => {
    const blob = [
      m.firstName, m.lastName, m.email, m.organization,
      m.clickerNumber, m.subStatus, m.membershipLevel,
      m.rangeDuty, m.rangeDutyDay,
    ].join(" ").toLowerCase();
    if (blob.includes(q)) return true;
    if (qDigits.length >= 3 && m.phone.replace(/\D/g, "").includes(qDigits)) return true;
    return false;
  });
}

export function fullName(m: Member): string {
  return [m.firstName, m.lastName].filter(Boolean).join(" ");
}
