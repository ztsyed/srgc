import Link from "next/link";
import { isoDate, monthEventMap } from "@/lib/events";
import type { Venue } from "@/lib/types";

export const dynamic = "force-dynamic";

const VENUE_DOT: Record<Venue, string> = {
  RP: "bg-blue-600",
  TRAP: "bg-amber-600",
  CLUBHOUSE: "bg-emerald-600",
  OTHER: "bg-slate-500",
};

function parseYM(ym?: string): { year: number; monthIdx0: number } {
  const now = new Date();
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) {
    return { year: now.getFullYear(), monthIdx0: now.getMonth() };
  }
  const [y, m] = ym.split("-").map(Number);
  return { year: y, monthIdx0: m - 1 };
}
function ymString(year: number, m0: number): string {
  return `${year}-${String(m0 + 1).padStart(2, "0")}`;
}
function shiftMonth(year: number, m0: number, delta: number): { year: number; monthIdx0: number } {
  const d = new Date(year, m0 + delta, 1);
  return { year: d.getFullYear(), monthIdx0: d.getMonth() };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const sp = await searchParams;
  const { year, monthIdx0 } = parseYM(sp.m);
  const map = await monthEventMap(year, monthIdx0);
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" })
    .format(new Date(year, monthIdx0, 1));
  const firstDow = new Date(year, monthIdx0, 1).getDay(); // 0..6
  const lastDay = new Date(year, monthIdx0 + 1, 0).getDate();
  const todayIso = isoDate(new Date());

  const cells: Array<{ day: number; iso: string } | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) {
    const iso = `${year}-${String(monthIdx0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, iso });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = shiftMonth(year, monthIdx0, -1);
  const next = shiftMonth(year, monthIdx0, +1);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <header className="flex items-center mb-4 gap-2">
        <Link
          className="px-3 py-2 rounded-lg bg-white border text-sm hover:bg-slate-100"
          href={`/calendar?m=${ymString(prev.year, prev.monthIdx0)}`}
        >
          ←
        </Link>
        <h1 className="text-xl sm:text-2xl font-semibold flex-1 text-center">{monthName}</h1>
        <Link
          className="px-3 py-2 rounded-lg bg-white border text-sm hover:bg-slate-100"
          href={`/calendar?m=${ymString(next.year, next.monthIdx0)}`}
        >
          →
        </Link>
      </header>

      <div className="grid grid-cols-7 text-center text-xs text-slate-500 mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c) return <div key={i} className="aspect-square" />;
          const venues = map.get(c.iso);
          const isToday = c.iso === todayIso;
          return (
            <Link
              key={i}
              href={`/calendar/${c.iso}`}
              className={`aspect-square rounded-lg border bg-white p-1 sm:p-2 flex flex-col items-start hover:bg-slate-50 ${
                isToday ? "ring-2 ring-slate-900" : ""
              }`}
            >
              <span className="text-xs sm:text-sm font-medium">{c.day}</span>
              {venues ? (
                <div className="mt-auto flex gap-1">
                  {(["RP", "TRAP", "CLUBHOUSE", "OTHER"] as Venue[])
                    .filter((v) => venues.has(v))
                    .map((v) => (
                      <span key={v} className={`w-1.5 h-1.5 rounded-full ${VENUE_DOT[v]}`} />
                    ))}
                </div>
              ) : null}
            </Link>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-600">
        <Legend color="bg-blue-600" label="Rifle & Pistol" />
        <Legend color="bg-amber-600" label="Trap" />
        <Legend color="bg-emerald-600" label="Clubhouse" />
        <Legend color="bg-slate-500" label="Other" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${color}`} /> {label}
    </span>
  );
}
