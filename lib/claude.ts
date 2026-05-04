import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ParsedEventsSchema, type ParsedEvents } from "./types";
import { z } from "zod";

const SYSTEM_PROMPT = `You extract structured event data from the Sunnyvale Rod & Gun Club newsletter PDF
("The Target Shooter").

Find the page titled "Upcoming Events" — a table with columns:
DAY | DATE | FROM | TO | EX USE | EVENT | CONTACT

Return JSON ONLY (no prose, no code fences) matching this exact shape:

{
  "month": "YYYY-MM",
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
- Convert dates like "5-Mar" using the newsletter's month/year context.
- IMPORTANT: include ONLY rows whose date falls inside the newsletter's own month. If a row shows a different month abbreviation (e.g. "14-Feb" appearing in a January newsletter), SKIP it — it will be covered by that month's own newsletter.
- Convert times like "9:00 AM" -> "09:00", "12:00 PM" -> "12:00", "9:00 PM" -> "21:00".
- Preserve event names verbatim, including quotes.
- Skip rows that are notes/separators, not real events (e.g. "Set Clocks Ahead", "Second Sunday / No Shooting", "Fourth Sunday / No Shooting", "Fifth Sunday / No Shooting"). Treat anything that is plainly a calendar reminder rather than a scheduled activity as not an event.
- Do NOT invent rows. If you cannot read a cell, leave the field as an empty string.
- Output a single JSON object only.`;

export async function parseNewsletter(pdfBuffer: Buffer, filenameHint?: string): Promise<ParsedEvents> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBuffer.toString("base64") },
          },
          {
            type: "text",
            text: filenameHint
              ? `Filename hint: ${filenameHint}. Extract the Upcoming Events table.`
              : "Extract the Upcoming Events table.",
          },
        ],
      },
    ],
  });

  const text = message.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("");

  const jsonText = stripCodeFences(text).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON: ${(e as Error).message}\n\nRaw:\n${text.slice(0, 1000)}`);
  }
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    system: DUTY_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBuffer.toString("base64") },
          },
          {
            type: "text",
            text: filenameHint
              ? `Filename hint: ${filenameHint}. Extract the duty roster (3-month table on page 7).`
              : "Extract the duty roster (3-month table on page 7).",
          },
        ],
      },
    ],
  });

  const text = message.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("");
  const jsonText = stripCodeFences(text).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON for duty: ${(e as Error).message}\n\nRaw:\n${text.slice(0, 1000)}`);
  }
  return DutyParseSchema.parse(parsed);
}

function stripCodeFences(s: string): string {
  // Prefer the first fenced block if present (Claude often wraps JSON in ```json).
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1];
  // Otherwise, slice from first '{' to last '}' to skip any surrounding prose.
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last > first) return s.slice(first, last + 1);
  return s;
}
