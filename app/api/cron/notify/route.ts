import { NextRequest } from "next/server";
import { dueToday, markFailed, markSent, pruneOld } from "@/lib/notifications";
import { sendNtfy } from "@/lib/ntfy";
import { loadPrefs } from "@/lib/prefs";
import { isoDate } from "@/lib/events";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fmt12h(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// POST or GET /api/cron/notify  with header  Authorization: Bearer <CRON_SECRET>
// Fires once a day from a Kubernetes CronJob. Idempotent — already-sent
// notifications stay sent, and a re-run that overlaps the same day will
// skip them.
export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }

async function run(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return new Response("CRON_SECRET not configured", { status: 500 });
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (provided !== expected) return new Response("Forbidden", { status: 403 });

  // Determine "today" in club-local time. Server may run in UTC; we want
  // the cron to fire based on Pacific time so a 7am-Pacific CronJob ticks
  // for the right local date.
  const today = isoDate(localDate());
  const due = await dueToday(today);

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const n of due) {
    const prefs = await loadPrefs(n.userEmail);
    if (!prefs?.ntfyTopic) {
      await markFailed(n.id, "no ntfy topic configured");
      results.push({ id: n.id, ok: false, error: "no topic" });
      continue;
    }
    // Mark sent BEFORE POST. This trades "occasional missed push when the
    // server crashes mid-call" for "never accidentally push twice when the
    // CronJob's backoffLimit retries". For a calendar reminder the duplicate
    // is the more annoying failure mode.
    await markSent(n.id, new Date().toISOString());
    try {
      await sendNtfy({
        topic: prefs.ntfyTopic,
        server: prefs.ntfyServer || undefined,
        title: `Today: ${n.eventTitle}`,
        message: `${fmt12h(n.eventTime)} at ${n.venue}`,
        tags: ["bell", "calendar"],
        priority: 4,
        click: `${siteUrl()}/calendar/${n.eventDate}`,
      });
      results.push({ id: n.id, ok: true });
    } catch (e) {
      const msg = (e as Error).message;
      // Mark failed; sentAt stays set so we don't auto-retry into a double-send.
      await markFailed(n.id, msg);
      results.push({ id: n.id, ok: false, error: msg });
    }
  }

  const pruned = await pruneOld(30);

  return Response.json({
    today,
    processed: results.length,
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    pruned,
    results,
  });
}

function localDate(): Date {
  // The pod runs in whatever TZ the container has. We trust it's set to
  // America/Los_Angeles (set in the Helm values via `TZ` env). If TZ isn't
  // set, this falls back to whatever the system time zone is, which for
  // alpine-node images defaults to UTC — meaning "today" rolls over at
  // 4-5pm Pacific. That's wrong for our 7am cron. Belt-and-suspenders: use
  // the UTC offset for Pacific time directly.
  const tz = process.env.TZ || "America/Los_Angeles";
  // Format current time in the desired zone, then re-parse.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}
