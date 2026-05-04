import "server-only";
import { promises as fs } from "node:fs";
import Papa from "papaparse";
import {
  MembersFileSchema,
  type Member,
  type MembersFile,
} from "./members-shared";
import { MEMBERS_PATH, ensureDataDirs } from "./paths";

export {
  MemberSchema,
  MembersFileSchema,
  searchMembers,
  fullName,
} from "./members-shared";
export type { Member, MembersFile } from "./members-shared";

const COLUMN_ALIASES: Record<keyof Omit<Member, "id">, string[]> = {
  profileUrl:       ["profileUrl", "Profile URL", "profile_url"],
  membershipLevel:  ["Membership level", "Membership Level", "membership", "Membership"],
  firstName:        ["First Name", "first_name", "FirstName"],
  lastName:         ["Last Name", "last_name", "LastName"],
  email:            ["Email", "email", "E-mail"],
  phone:            ["Phone", "phone", "Phone Number"],
  joinDate:         ["Club Join Date", "Join Date", "join_date"],
  workPartyMonth:   ["Work Party Month", "WP Month", "work_party_month"],
  rangeDuty:        ["Range Duty", "range_duty"],
  rangeDutyAMPM:    ["Range Duty AM/PM", "AM/PM", "range_duty_ampm"],
  rangeDutyDay:     ["Range Duty Day", "Duty Day", "range_duty_day"],
  clickerNumber:    ["Clicker Number", "Clicker", "clicker_number"],
  subStatus:        ["Member Sub-Status", "Sub-Status", "sub_status"],
  organization:     ["Organization", "Org", "organization"],
};

function pick(row: Record<string, string>, aliases: string[]): string {
  for (const a of aliases) if (a in row && row[a] != null) return String(row[a]).trim();
  return "";
}

function extractIdFromProfileUrl(url: string): string {
  const m = url.match(/PublicProfile\/(\d+)/);
  return m ? m[1] : "";
}

export function parseMembersCsv(csv: string): { members: Member[]; warnings: string[] } {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
  });
  const warnings: string[] = result.errors.slice(0, 5).map((e) => `${e.code}: ${e.message} (row ${e.row})`);
  const members: Member[] = [];
  const seen = new Set<string>();
  for (const row of result.data) {
    const profileUrl = pick(row, COLUMN_ALIASES.profileUrl);
    if (!profileUrl) continue;
    const id = extractIdFromProfileUrl(profileUrl);
    if (!id) {
      warnings.push(`Skipping row with unrecognized profileUrl: ${profileUrl}`);
      continue;
    }
    if (seen.has(id)) {
      warnings.push(`Duplicate profile ID ${id} — keeping first occurrence`);
      continue;
    }
    seen.add(id);
    const m: Member = {
      id,
      profileUrl,
      membershipLevel: pick(row, COLUMN_ALIASES.membershipLevel),
      firstName:       pick(row, COLUMN_ALIASES.firstName),
      lastName:        pick(row, COLUMN_ALIASES.lastName),
      email:           pick(row, COLUMN_ALIASES.email),
      phone:           pick(row, COLUMN_ALIASES.phone),
      joinDate:        pick(row, COLUMN_ALIASES.joinDate),
      workPartyMonth:  pick(row, COLUMN_ALIASES.workPartyMonth),
      rangeDuty:       pick(row, COLUMN_ALIASES.rangeDuty),
      rangeDutyAMPM:   pick(row, COLUMN_ALIASES.rangeDutyAMPM),
      rangeDutyDay:    pick(row, COLUMN_ALIASES.rangeDutyDay),
      clickerNumber:   pick(row, COLUMN_ALIASES.clickerNumber),
      subStatus:       pick(row, COLUMN_ALIASES.subStatus),
      organization:    pick(row, COLUMN_ALIASES.organization),
    };
    if (!m.firstName && !m.lastName) {
      warnings.push(`Skipping ID ${id} with empty name`);
      continue;
    }
    members.push(m);
  }
  members.sort((a, b) => {
    const keyA = (a.lastName || a.firstName).toLowerCase();
    const keyB = (b.lastName || b.firstName).toLowerCase();
    return keyA.localeCompare(keyB) || a.firstName.localeCompare(b.firstName);
  });
  return { members, warnings };
}

export async function writeMembersFile(members: Member[], source?: string): Promise<void> {
  await ensureDataDirs();
  const file: MembersFile = { uploadedAt: new Date().toISOString(), source, members };
  await fs.writeFile(MEMBERS_PATH, JSON.stringify(file, null, 2));
}

export async function loadMembersFile(): Promise<MembersFile | null> {
  await ensureDataDirs();
  try {
    const raw = await fs.readFile(MEMBERS_PATH, "utf8");
    return MembersFileSchema.parse(JSON.parse(raw));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
