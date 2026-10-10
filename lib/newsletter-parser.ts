import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ParsedEventsSchema, type ParsedEvents } from "./types";
import { z } from "zod";
import { anthropicApiKey, llmProvider, ollamaChat } from "./llm";
import { extractDutyRosterText, formatPages, pdfPages } from "./pdf-text";

const SYSTEM_PROMPT = `You extract structured event data from the Sunnyvale Rod & Gun Club newsletter PDF
("The Target Shooter").

Find the page titled "Upcoming Events" — a table with columns:
DAY | DATE | FROM | TO | EX USE | EVENT | CONTACT

Return JSON ONLY (no prose, no code fences) matching this exact shape:

{
  "month": "YYYY-MM",
  "eventsPage": 4,            // 1-indexed PDF page where the Upcoming Events table starts
  "events": [
    {
      "date": "YYYY-MM-DD",
      "from": "HH:MM",      // 24-hour
      "to":   "HH:MM",      // 24-hour; if blank in source, repeat 'from'
      "exUse": "RP: All",   // verbatim from "EX USE" column; "" if blank
      "event": "Action Pistol",
      "contact": "Doug Chew 408-245-4936"  // "" if blank
    }
  ]
}

Rules:
- "month" is the newsletter's own month (e.g. cover/header says "March 2026" -> "2026-03"). Always emit YYYY-MM.
- "eventsPage" is the 1-indexed page in this PDF where the "Upcoming Events" table starts (e.g. if the table heading appears on page 4 of an 8-page newsletter, return 4). It enables deep-linking the app's per-event "Newsletter" pill to the correct page.
- Convert dates like "5-Mar" using the newsletter's month/year context.
- IMPORTANT: include ONLY rows whose date falls inside the newsletter's own month. If a row shows a different month abbreviation (e.g. "14-Feb" appearing in a January newsletter), SKIP it — it will be covered by that month's own newsletter.
- Convert times like "9:00 AM" -> "09:00", "12:00 PM" -> "12:00", "9:00 PM" -> "21:00".
- Preserve event names verbatim, including quotes.
- Skip rows that are notes/separators, not real events (e.g. "Set Clocks Ahead", "Second Sunday / No Shooting", "Fourth Sunday / No Shooting", "Fifth Sunday / No Shooting"). Treat anything that is plainly a calendar reminder rather than a scheduled activity as not an event.
- Do NOT invent rows. If you cannot read a cell, leave the field as an empty string.
- Output a single JSON object only.`;

export async function parseNewsletter(pdfBuffer: Buffer, filenameHint?: string): Promise<ParsedEvents> {
  const instruction = filenameHint
    ? `Filename hint: ${filenameHint}. Extract the Upcoming Events table.`
    : "Extract the Upcoming Events table.";

  let text: string;
  if (llmProvider("parse") === "ollama") {
    const pages = formatPages(await pdfPages(pdfBuffer));
    text = await ollamaChat({
      think: "low",
      format: "json",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + OLLAMA_TEXT_NOTE },
        { role: "user", content: `<newsletter>\n${pages}\n</newsletter>\n\n${instruction}` },
      ],
    });
  } else {
    text = await claudeExtract(SYSTEM_PROMPT, pdfBuffer, instruction, 8000);
  }

  const parsed = parseModelJson(text, "events");
  const validated = ParsedEventsSchema.parse(parsed);
  // Belt-and-suspenders: drop any rows whose date doesn't match the
  // newsletter's own month. Prevents a stray "14-Feb" row in a January
  // newsletter from being permanently invisible (since the Today/Calendar
  // logic only loads the file matching the day's own month).
  validated.events = validated.events.filter((e) => e.date.startsWith(`${validated.month}-`));
  return validated;
}

// ──────────────────────────────────────────────────────────────────────────
// Duty roster parser
// ──────────────────────────────────────────────────────────────────────────

const DUTY_SYSTEM_PROMPT = `You extract the range-duty roster from the
Sunnyvale Rod & Gun Club newsletter PDF ("The Target Shooter"). The
roster (usually page 7) is a 3-month rolling table — typically the
current newsletter's month, the next month, and the month after that.

Each block has columns roughly:
Day | Rangemaster | Range Safety Officers | Trap Captain | Trap Officers

Sundays sometimes show ATA captain + ATA officers. The "Office" or
"Cashier" rows belong to the Rangemaster column. Names look like
"M. Taylor", "L. Larson (PM)", "Ga Spellman" (two-letter initial).

Return JSON ONLY (no prose, no fences) of this exact shape:

{
  "months": ["YYYY-MM", "YYYY-MM", "YYYY-MM"],
  "assignments": [
    {
      "date": "YYYY-MM-DD",
      "role": "RM" | "Cashier" | "RSO" | "Trap Captain" | "Trap Officer" | "5-Stand" | "ATA Captain" | "ATA Officer" | "Office",
      "ampm": "AM" | "PM" | "ALL",
      "rawName": "M. Taylor"
    }
  ]
}

Rules:
- One row PER name PER role. If a cell lists "A. Cha / P. Chamberlain / E. Chen / M. Cox" under RSOs for that day, emit four assignments — one per name.
- A name suffixed with "(PM)" gets "ampm": "PM". A name suffixed with "(AM)" gets "ampm": "AM".
- Tuesdays have separate AM and PM shifts in the source — look at the row/column structure: the row is split into AM and PM halves. Determine which half each name appears in. Default to "AM" only if the structure is genuinely ambiguous.
- For Saturdays and Sundays (single-shift days), use "ampm": "ALL".
- Resolve dates from the block headers (e.g. "26-Mar" means March 2026; "26-May" means May 2026).
- Preserve names verbatim in "rawName". Do NOT expand initials.
- If a cell is empty for a date, just skip — don't emit a row with empty rawName.
- "months" lists the three duty months covered, in order.
- Output a single JSON object only.`;

const DutyParseSchema = z.object({
  months: z.array(z.string().regex(/^\d{4}-\d{2}$/)).min(1).max(4),
  assignments: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      role: z.string().min(1),
      ampm: z.enum(["AM", "PM", "ALL"]),
      rawName: z.string().min(1),
    }),
  ),
});
export type ParsedDuty = z.infer<typeof DutyParseSchema>;

export async function parseDutyRoster(pdfBuffer: Buffer, filenameHint?: string): Promise<ParsedDuty> {
  if (llmProvider("parse") === "ollama") return parseDutyRosterOllama(pdfBuffer);

  const instruction = filenameHint
    ? `Filename hint: ${filenameHint}. Extract the duty roster (3-month table on page 7).`
    : "Extract the duty roster (3-month table on page 7).";

  const text = await claudeExtract(DUTY_SYSTEM_PROMPT, pdfBuffer, instruction, 16000);
  return DutyParseSchema.parse(parseModelJson(text, "duty"));
}

// The local model gets the coordinate-normalised roster (raw page text
// scrambles which row each cell belongs to — see pdf-text.ts) and answers in
// one compact line per assignment instead of JSON: the roster runs to ~400
// assignments and generation time is the bottleneck on the DGX. Everything
// mechanical (AM/PM from the "(PM)" markers, the month list) is done in code,
// and every name is checked against its day's cells to catch rows the model
// copied from the wrong day.
const OLLAMA_DUTY_PROMPT = `You convert the Sunnyvale Rod & Gun Club range-duty roster into one line
per person per role.

Input: the roster already split into days. Each day is a line
"YYYY-MM-DD (Weekday)" followed by its cells: Rangemaster, Range Safety
Officers, Trap Captain, Trap Officers. Within a cell, "; " and " | " separate
sub-lists and "/" separates names.

Output: ONLY lines of the form
DATE|ROLE|NAME
e.g.
2026-10-03|RM|P. Knauer
2026-10-06|RSO|D. Soshuikov (PM)

Rules:
- DATE: copy the day's date exactly as given. Work through the days in order
  and take names only from that day's cells.
- ROLE, exactly one of: RM, Cashier, RSO, Trap Captain, Trap Officer,
  5-Stand, ATA Captain, ATA Officer, Office.
  - "RM:"/"RMs:" -> RM; "Cashier:"/"Cashiers:" -> Cashier; "RSOs:" -> RSO.
  - Trap Captain cell: names after "ATA:" -> ATA Captain; anything else (bare
    names, "Public:", "SBTL:", "Club:") -> Trap Captain.
  - Trap Officers cell: names after "ATA:" -> ATA Officer, including the
    following "; "-separated lists, until another label appears; "Office:" ->
    Office; "5-Stand:" -> 5-Stand; everything else ("Trap:", "Public:",
    "SBTL:", "Club:", bare names) -> Trap Officer.
- NAME: copy verbatim as printed, KEEPING any "(PM)" or "(AM)" after it; do
  not expand initials; drop the role label.
- Every name gets its own line. Skip empty cells. Do not invent names.
- No headers, no commentary, no code fences.`;

async function parseDutyRosterOllama(pdfBuffer: Buffer): Promise<ParsedDuty> {
  const roster = await extractDutyRosterText(pdfBuffer);
  if (!roster) throw new Error("No duty roster table found in the PDF");
  const text = await ollamaChat({
    think: "low",
    messages: [
      { role: "system", content: OLLAMA_DUTY_PROMPT },
      { role: "user", content: roster },
    ],
  });

  // date -> { weekday, cell text } for validating the model's lines.
  const days = new Map<string, { weekday: string; text: string }>();
  for (const block of roster.split(/^(?=\d{4}-\d{2}-\d{2} )/m)) {
    const m = block.match(/^(\d{4}-\d{2}-\d{2}) \((\w+)\)/);
    if (m) days.set(m[1], { weekday: m[2], text: block });
  }

  const assignments: ParsedDuty["assignments"] = [];
  const rejected: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const [date, role, name] = line.split("|").map((f) => f?.trim());
    const day = days.get(date);
    const marker = name?.match(/\((AM|PM)\)\s*$/)?.[1] as "AM" | "PM" | undefined;
    const rawName = name?.replace(/\s*\((AM|PM)\)\s*$/, "");
    if (!day || !role || !rawName || !day.text.includes(rawName)) {
      rejected.push(line);
      continue;
    }
    // Tuesdays run separate AM and PM shifts; only PM names are marked.
    const ampm = marker ?? (day.weekday === "Tue" ? "AM" : "ALL");
    assignments.push({ date, role, ampm, rawName });
  }
  if (rejected.length) {
    console.warn(`[parseDutyRoster] dropped ${rejected.length} model line(s) not matching the roster:`, rejected.slice(0, 10));
  }
  const months = [...new Set([...days.keys()].map((d) => d.slice(0, 7)))].sort();
  return DutyParseSchema.parse({ months, assignments });
}

// ──────────────────────────────────────────────────────────────────────────
// Provider plumbing
// ──────────────────────────────────────────────────────────────────────────

// Appended to the prompts when the model gets extracted text, not the PDF.
const OLLAMA_TEXT_NOTE = `

Input note: you are given the newsletter as plain text extracted from the PDF
with its column layout preserved, each page introduced by a line
"=== PAGE n ===". Use those markers for "eventsPage". The events table column
headed "EX USE" may be headed "VENUE" in some issues — treat them the same.`;

async function claudeExtract(
  system: string,
  pdfBuffer: Buffer,
  instruction: string,
  maxTokens: number,
): Promise<string> {
  const client = new Anthropic({ apiKey: anthropicApiKey() });
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBuffer.toString("base64") },
          },
          { type: "text", text: instruction },
        ],
      },
    ],
  });
  return message.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("");
}

function parseModelJson(text: string, what: string): unknown {
  try {
    return JSON.parse(stripCodeFences(text).trim());
  } catch (e) {
    throw new Error(`Model returned invalid JSON for ${what}: ${(e as Error).message}\n\nRaw:\n${text.slice(0, 1000)}`);
  }
}

function stripCodeFences(s: string): string {
  // Prefer the first fenced block if present (models often wrap JSON in ```json).
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1];
  // Otherwise, slice from first '{' to last '}' to skip any surrounding prose.
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last > first) return s.slice(first, last + 1);
  return s;
}
