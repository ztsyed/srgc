import type { Venue } from "./types";

const FIVE_STAND_KEYWORDS = ["5-stand", "five-stand", "five stand"];
const TRAP_KEYWORDS = ["trap", "ata", "sbtl", "bayprof", "clay"];
const RP_KEYWORDS = [
  "bullseye", "action pistol", "cowboy", "nrl22", "downrange", "benchrest",
  "sass", "rifle", "pistol", "yamaguchi", "club shoot", "small bore silhouette",
];
const CLUBHOUSE_KEYWORDS = ["dinner", "meeting", "raffle", "feast"];

export function deriveVenue(eventName: string, exUse: string | undefined): Venue {
  const ex = (exUse ?? "").toUpperCase().trim();
  if (ex.startsWith("RP") || ex.startsWith("RF")) return "RP";
  if (ex.startsWith("5S")) return "FIVE_STAND";
  if (ex.startsWith("TF")) return "TRAP";
  if (ex === "CH") return "CLUBHOUSE";

  const name = eventName.toLowerCase();
  // Check 5-Stand before Trap so it doesn't get swallowed by the "trap" keyword
  // when an event is named e.g. "5-Stand Trap Practice".
  if (FIVE_STAND_KEYWORDS.some((k) => name.includes(k))) return "FIVE_STAND";
  if (TRAP_KEYWORDS.some((k) => name.includes(k))) return "TRAP";
  if (CLUBHOUSE_KEYWORDS.some((k) => name.includes(k))) return "CLUBHOUSE";
  if (RP_KEYWORDS.some((k) => name.includes(k))) return "RP";
  return "OTHER";
}

// Shooting-allowed hours rule (page 12 of newsletter, Regularly Scheduled Events)
// M-F 9:05 AM to 8:55 PM, Sat 9:05 AM to 5:55 PM
// 1st & 3rd Sunday 10:05 AM to 2:55 PM
// Closed all shooting on 2nd, 4th, 5th Sundays, Easter, Thanksgiving, Christmas
// Members only on Christmas Eve, NYE, NY Day
export type ShootingHours =
  | { status: "open"; from: string; to: string; note?: string }
  | { status: "closed"; reason: string }
  | { status: "members-only"; from: string; to: string; reason: string }
  // The range isn't open for casual public shooting today, but it isn't
  // "closed" either — leagues / scheduled events can still run. Used by Trap
  // and 5-Stand on Mon/Tue/Thu/Fri/Sun where public hours aren't posted.
  | { status: "schedule-only"; publicHours: string };

export function shootingHoursFor(date: Date): ShootingHours {
  const day = date.getDay(); // 0 = Sun ... 6 = Sat
  const dom = date.getDate();
  const sundayOrdinal = Math.ceil(dom / 7); // 1..5

  if (isFixedClosure(date)) {
    return { status: "closed", reason: fixedClosureReason(date)! };
  }
  if (isMembersOnlyHoliday(date)) {
    return { status: "members-only", from: "09:05", to: "17:55", reason: membersOnlyReason(date)! };
  }
  if (day === 0) {
    if (sundayOrdinal === 1 || sundayOrdinal === 3) {
      return { status: "open", from: "10:05", to: "14:55", note: "1st/3rd Sunday hours" };
    }
    return { status: "closed", reason: `${ordinalLabel(sundayOrdinal)} Sunday — no shooting` };
  }
  if (day === 6) return { status: "open", from: "09:05", to: "17:55" };
  return { status: "open", from: "09:05", to: "20:55" };
}

// Trap range public-shooting hours: Wed evenings and Sat afternoons only.
// Same fixed closures and members-only holidays as the club-wide rule.
// 5-Stand uses the same schedule.
export function trapHoursFor(date: Date): ShootingHours {
  const day = date.getDay();
  if (isFixedClosure(date)) {
    return { status: "closed", reason: fixedClosureReason(date)! };
  }
  if (isMembersOnlyHoliday(date)) {
    return { status: "members-only", from: "09:05", to: "17:55", reason: membersOnlyReason(date)! };
  }
  if (day === 3) return { status: "open", from: "17:00", to: "21:00" };
  if (day === 6) return { status: "open", from: "13:00", to: "17:00" };
  return {
    status: "schedule-only",
    publicHours: "Wed 5:00 – 9:00 PM · Sat 1:00 – 5:00 PM",
  };
}

function ordinalLabel(n: number): string {
  return ["", "1st", "2nd", "3rd", "4th", "5th"][n] ?? `${n}th`;
}

function isFixedClosure(d: Date): boolean {
  return fixedClosureReason(d) !== null;
}
function fixedClosureReason(d: Date): string | null {
  const m = d.getMonth(), day = d.getDate();
  if (m === 11 && day === 25) return "Christmas Day";
  if (m === 10 && isNthDow(d, 4, 4)) return "Thanksgiving"; // 4th Thursday of November
  if (isEaster(d)) return "Easter Sunday";
  return null;
}
function isMembersOnlyHoliday(d: Date): boolean {
  return membersOnlyReason(d) !== null;
}
function membersOnlyReason(d: Date): string | null {
  const m = d.getMonth(), day = d.getDate();
  if (m === 11 && day === 24) return "Christmas Eve";
  if (m === 11 && day === 31) return "New Year's Eve";
  if (m === 0 && day === 1) return "New Year's Day";
  return null;
}
function isNthDow(d: Date, dow: number, n: number): boolean {
  if (d.getDay() !== dow) return false;
  return Math.ceil(d.getDate() / 7) === n;
}
// Computus (Anonymous Gregorian algorithm)
function isEaster(d: Date): boolean {
  const y = d.getFullYear();
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const dx = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - dx - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31); // 3 = Mar, 4 = Apr
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  return d.getMonth() === month - 1 && d.getDate() === day;
}
