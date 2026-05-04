import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { buildIcs, eventUid, type IcsEvent } from "@/lib/ics";
import { siteUrl } from "@/lib/site-url";
import { VENUE_LABEL, type Venue } from "@/lib/types";

export const runtime = "nodejs";

// Download a single event as .ics for one-shot "Add to Calendar".
// Query params: date=YYYY-MM-DD, time=HH:MM, end=HH:MM (optional),
// title=..., venue=RP|TRAP|CLUBHOUSE|OTHER (optional)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const u = req.nextUrl;
  const date = u.searchParams.get("date") ?? "";
  const time = u.searchParams.get("time") ?? "";
  const end = u.searchParams.get("end") ?? undefined;
  const title = (u.searchParams.get("title") ?? "").trim();
  const venue = (u.searchParams.get("venue") ?? "OTHER") as Venue;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !title) {
    return new Response("Bad request", { status: 400 });
  }
  const event: IcsEvent = {
    uid: eventUid(date, time, title),
    date, start: time, end,
    summary: title,
    location: VENUE_LABEL[venue] ?? "Sunnyvale Rod & Gun Club",
    url: `${siteUrl()}/calendar/${date}`,
  };
  const body = buildIcs(title, [event]);
  const safeName = title.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60);
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${date}-${safeName}.ics"`,
    },
  });
}
