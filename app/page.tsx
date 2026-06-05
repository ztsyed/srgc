import Link from "next/link";
import DayView from "@/components/DayView";
import ForYouCard from "@/components/ForYouCard";
import { eventsForDate, loadEventsMeta, monthKey } from "@/lib/events";
import { findNextDutyForMember } from "@/lib/duty";
import { getCurrentMember, nextRecurrence } from "@/lib/me";

export const dynamic = "force-dynamic";

function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(s?: string): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const today = new Date();
  const now = parseDate(dateParam) ?? today;
  const isToday = isoLocal(now) === isoLocal(today);

  const month = monthKey(now);
  const [events, member, meta] = await Promise.all([
    eventsForDate(now),
    getCurrentMember(),
    loadEventsMeta(month),
  ]);
  const newsletter = meta?.eventsPage ? { month, page: meta.eventsPage } : null;

  // "For you" is forward-looking from the real today — it should not change
  // when the user navigates to view another day's schedule below.
  const nextMeeting = nextRecurrence(today, /* Thu */ 4, /* 1st */ 1);
  const nextBoardMeeting = nextRecurrence(today, /* Thu */ 4, /* 2nd */ 2);
  const nextWorkParty = nextRecurrence(today, /* Sun */ 0, /* 2nd */ 2);
  const nextDuty = member ? await findNextDutyForMember(member, today) : null;

  const prevHref = `/?date=${isoLocal(addDays(now, -1))}`;
  const nextHref = `/?date=${isoLocal(addDays(now, 1))}`;

  const fmt = new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <header>
        <p className="text-sm text-slate-500">{isToday ? "Today" : "Selected day"}</p>
        <h1 className="text-2xl sm:text-3xl font-semibold">{fmt.format(now)}</h1>
      </header>
      <nav className="flex items-center justify-between gap-2">
        <Link
          href={prevHref}
          rel="prev"
          className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <span aria-hidden="true">←</span> Previous day
        </Link>
        {isToday ? (
          <span className="text-xs uppercase tracking-wide text-slate-400">Today</span>
        ) : (
          <Link href="/" className="text-sm text-slate-500 hover:underline">
            Jump to today
          </Link>
        )}
        <Link
          href={nextHref}
          rel="next"
          className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Next day <span aria-hidden="true">→</span>
        </Link>
      </nav>
      {member ? (
        <ForYouCard
          member={member}
          nextMeeting={nextMeeting}
          nextBoardMeeting={nextBoardMeeting}
          nextWorkParty={nextWorkParty}
          nextDuty={nextDuty}
        />
      ) : null}
      <DayView date={now} events={events} newsletter={newsletter} />
    </div>
  );
}
