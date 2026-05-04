// Smoke-test the recurring/event aggregation logic without OAuth or Claude.
// Usage: DATA_DIR=./data node scripts/smoke-data.mjs

import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "./data");
const SEED_DIR = path.resolve("./data-seed");

await fs.mkdir(path.join(DATA_DIR, "events"), { recursive: true });
await fs.mkdir(path.join(DATA_DIR, "pdfs"),   { recursive: true });

// Copy seed if missing.
const recPath = path.join(DATA_DIR, "recurring.json");
try { await fs.access(recPath); }
catch { await fs.copyFile(path.join(SEED_DIR, "recurring.json"), recPath); }

// Hand-author a tiny fake events/2026-03.json drawn from page 5 of SVRGC-032026.
const fake = [
  { date: "2026-03-05", from: "09:00", to: "12:00", exUse: "RP: All", event: "Downrange Shooting", contact: "" },
  { date: "2026-03-05", from: "17:30", to: "18:30", exUse: "CH",      event: "Club Dinner",        contact: "" },
  { date: "2026-03-05", from: "19:00", to: "20:30", exUse: "CH",      event: "General Membership Meeting", contact: "" },
  { date: "2026-03-14", from: "09:00", to: "12:00", exUse: "RF: All", event: "Small Bore Silhouette Match", contact: "Jeff Larese 408-921-0860" },
];
await fs.writeFile(path.join(DATA_DIR, "events", "2026-03.json"), JSON.stringify(fake, null, 2));

// Use tsx-equivalent via dynamic import of compiled output is overkill; just hand-roll a JS port of the rules.
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const recurring = JSON.parse(await fs.readFile(recPath, "utf8"));

function nthDow(date) { return Math.ceil(date.getDate() / 7); }
function matches(rule, date) {
  if (rule.weekday !== WEEKDAYS[date.getDay()]) return false;
  if (rule.ordinal === "every") return true;
  const n = nthDow(date);
  if (n === rule.ordinal) return true;
  if (rule.ordinalSecond && n === rule.ordinalSecond) return true;
  return false;
}

function deriveVenue(name, ex) {
  const e = (ex || "").toUpperCase();
  if (e.startsWith("RP") || e.startsWith("RF")) return "RP";
  if (e.startsWith("TF")) return "TRAP";
  if (e === "CH") return "CLUBHOUSE";
  const n = name.toLowerCase();
  if (/trap|5-stand|ata|sbtl|bayprof|small bore silhouette/.test(n)) return "TRAP";
  if (/dinner|meeting|raffle|feast/.test(n)) return "CLUBHOUSE";
  if (/bullseye|action pistol|cowboy|nrl22|downrange|benchrest|sass|rifle|pistol/.test(n)) return "RP";
  return "OTHER";
}

async function dayEvents(dateStr) {
  const date = new Date(dateStr + "T00:00:00");
  const monthKey = dateStr.slice(0, 7);
  let raw = "[]";
  try { raw = await fs.readFile(path.join(DATA_DIR, "events", `${monthKey}.json`), "utf8"); } catch {}
  const monthly = JSON.parse(raw)
    .filter(e => e.date === dateStr)
    .map(e => ({ ...e, venue: deriveVenue(e.event, e.exUse), source: "monthly" }));
  const monthlyKeys = new Set(monthly.map(e => `${e.venue}|${e.from}`));
  const nearby = (t) => {
    const [h, m] = t.split(":").map(Number);
    const out = [];
    for (let dm = -5; dm <= 5; dm += 5) {
      const total = h * 60 + m + dm;
      if (total < 0 || total >= 1440) continue;
      out.push(`${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`);
    }
    return out;
  };
  const recurMatches = recurring
    .filter(r => matches(r, date))
    .filter(r => !nearby(r.time).some(t => monthlyKeys.has(`${r.venue}|${t}`)))
    .map(r => ({ source: "recurring", from: r.time, event: r.event, venue: r.venue }));
  return [...recurMatches, ...monthly]
    .sort((a, b) => a.from.localeCompare(b.from));
}

// Test: Thursday March 5 2026 should have Downrange (recurring + monthly), Club Dinner (1st Thu), Club Meeting (1st Thu), and the monthly extras.
const t1 = await dayEvents("2026-03-05");
console.log("=== 2026-03-05 (Thu) ===");
for (const e of t1) console.log(`  ${e.from}  [${e.venue}]  ${e.event}  (${e.source})`);

// Test: Monday March 9 2026 should have Monday Night Trap League (every Mon) and NRL22 (2nd Mon).
const t2 = await dayEvents("2026-03-09");
console.log("\n=== 2026-03-09 (Mon, 2nd Mon) ===");
for (const e of t2) console.log(`  ${e.from}  [${e.venue}]  ${e.event}  (${e.source})`);

// Test: Wednesday March 4 (1st Wed) -> Action Pistol (every), Wed Trap League (every), Bullseye (1st Wed).
const t3 = await dayEvents("2026-03-04");
console.log("\n=== 2026-03-04 (Wed, 1st Wed) ===");
for (const e of t3) console.log(`  ${e.from}  [${e.venue}]  ${e.event}  (${e.source})`);

// Sanity: recurring count == 14
console.log(`\nLoaded ${recurring.length} recurring rules.`);
