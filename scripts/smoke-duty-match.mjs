// Smoke-test parseRosterName + matchesMember for tricky cases.

const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv"]);
function parseRosterName(raw) {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  const m = cleaned.match(/^([A-Za-z]{1,2})\.?\s+(.+)$/);
  if (!m) return null;
  const initial = m[1].charAt(0).toUpperCase();
  const tokens = m[2].split(/\s+/).map(t => t.replace(/,$/, ""));
  while (tokens.length > 1 && SUFFIXES.has(tokens[tokens.length - 1].toLowerCase())) tokens.pop();
  const last = tokens.join(" ").replace(/,$/, "").trim();
  if (!last) return null;
  return { initial, last };
}
function normalizeLast(s) {
  let out = s.trim().toLowerCase();
  out = out.replace(/[\s,]+(jr\.?|sr\.?|ii|iii|iv)$/i, "");
  return out.replace(/\s+/g, " ").trim();
}
function matchesMember(rawName, member) {
  const parsed = parseRosterName(rawName);
  if (!parsed) return { strict: false, loose: false };
  const lastMatch = normalizeLast(parsed.last) === normalizeLast(member.lastName);
  const initialMatch = parsed.initial.toUpperCase() === member.firstName.charAt(0).toUpperCase();
  return { strict: lastMatch && initialMatch, loose: lastMatch };
}

const cases = [
  { raw: "Z. Syed",        member: { firstName: "Zia", lastName: "Syed" },          want: { strict: true,  loose: true  } },
  { raw: "S. Syed",        member: { firstName: "Zia", lastName: "Syed" },          want: { strict: false, loose: true  } },
  { raw: "C. Frink, Jr.",  member: { firstName: "Cleave", lastName: "Frink, Jr." }, want: { strict: true,  loose: true  } },
  { raw: "C. Frink",       member: { firstName: "Cleave", lastName: "Frink, Jr." }, want: { strict: true,  loose: true  } },
  { raw: "L. Vander Wal",  member: { firstName: "Les", lastName: "Vander Wal" },    want: { strict: true,  loose: true  } },
  { raw: "Ga Spellman",    member: { firstName: "Garrett", lastName: "Spellman" },  want: { strict: true,  loose: true  } },
  { raw: "M. Taylor",      member: { firstName: "Bob", lastName: "Smith" },         want: { strict: false, loose: false } },
  { raw: "P. Saffren",     member: { firstName: "Paul", lastName: "Saffren" },      want: { strict: true,  loose: true  } },
];
let pass = 0, fail = 0;
for (const c of cases) {
  const got = matchesMember(c.raw, c.member);
  const ok = got.strict === c.want.strict && got.loose === c.want.loose;
  console.log(ok ? "✓" : "✗", `"${c.raw}" vs ${c.member.firstName} ${c.member.lastName}`, "→", got);
  ok ? pass++ : fail++;
}
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
