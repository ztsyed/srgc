// Smoke-test parseMembersCsv against the real CSV. Run via tsx is overkill;
// inline-compile is overkill — just exercise the same Papa.parse + transforms.

import { promises as fs } from "node:fs";
import Papa from "papaparse";

const csv = await fs.readFile("docs/SRGC_Members_2026-05-04.csv", "utf8");
const result = Papa.parse(csv, { header: true, skipEmptyLines: "greedy" });

console.log("Errors:", result.errors.length);
console.log("Rows:  ", result.data.length);

const ids = new Set();
let bad = 0, dup = 0;
const levels = {};
for (const row of result.data) {
  const url = row["profileUrl"] ?? "";
  const m = url.match(/PublicProfile\/(\d+)/);
  if (!m) { bad++; continue; }
  if (ids.has(m[1])) { dup++; continue; }
  ids.add(m[1]);
  const lvl = row["Membership level"] || "?";
  levels[lvl] = (levels[lvl] ?? 0) + 1;
}
console.log("Unique IDs:", ids.size);
console.log("Bad URLs:  ", bad);
console.log("Duplicates:", dup);
console.log("Levels:    ", levels);

// Spot-check one record
const first = result.data[0];
console.log("\nFirst row keys:", Object.keys(first).join(", "));
console.log("First row sample:", JSON.stringify({
  url: first.profileUrl,
  name: `${first["First Name"]} ${first["Last Name"]}`,
  email: first.Email,
  phone: first.Phone,
  duty: first["Range Duty"],
}, null, 2));
