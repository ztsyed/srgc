import { NextRequest } from "next/server";
import { allowedEmailsFromEnv, emailFromToken } from "@/lib/calendar-token";
import { eventsBetween } from "@/lib/events";
import { buildIcs, eventUid, type IcsEvent } from "@/lib/ics";
import { siteUrl } from "@/lib/site-url";
import { VENUE_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Subscribe with: webcal://<your-host>/calendar/feed/<token>.ics
// (or http(s) — iOS/Android calendar apps accept both schemes)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/i, "");
  const email = emailFromToken(token, allowedEmailsFromEnv());
  if (!email) return new Response("Forbidden", { status: 403 });

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 120);
  const days = await eventsBetween(start, end);

  const events: IcsEvent[] = [];
  for (const day of days) {
    for (const e of day.events) {
      events.push({
        uid: eventUid(day.date, e.from, e.event),
        date: day.date,
        start: e.from,
        end: e.to,
        summary: e.event,
        location: VENUE_LABEL[e.venue] ?? "Sunnyvale Rod & Gun Club",
        description: [e.exUse, e.contact].filter(Boolean).join(" · "),
        url: `${siteUrl()}/calendar/${day.date}`,
      });
    }
  }

  const body = buildIcs("SRGC Schedule", events);
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="srgc.ics"`,
      // Per-user authenticated resource — never share via shared caches.
      "Cache-Control": "private, max-age=900",
    },
  });
}
