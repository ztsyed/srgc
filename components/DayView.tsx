import type { DayEvent, Venue } from "@/lib/types";
import { VENUE_LABEL } from "@/lib/types";
import { shootingHoursFor, type ShootingHours } from "@/lib/venue";
import EventActions from "./EventActions";

function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const VENUE_COLORS: Record<Venue, string> = {
  RP: "bg-blue-50 border-blue-200",
  TRAP: "bg-amber-50 border-amber-200",
  CLUBHOUSE: "bg-emerald-50 border-emerald-200",
  OTHER: "bg-slate-50 border-slate-200",
};
const VENUE_DOT: Record<Venue, string> = {
  RP: "bg-blue-600",
  TRAP: "bg-amber-600",
  CLUBHOUSE: "bg-emerald-600",
  OTHER: "bg-slate-500",
};

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function HoursBanner({ hours }: { hours: ShootingHours }) {
  if (hours.status === "open") {
    return (
      <div className="rounded-xl bg-slate-900 text-white px-4 py-3 text-sm">
        <span className="font-semibold">Open for shooting</span>
        <span className="ml-2 opacity-80">
          {formatTime(hours.from)} – {formatTime(hours.to)}
        </span>
        {hours.note ? <span className="ml-2 opacity-60">· {hours.note}</span> : null}
      </div>
    );
  }
  if (hours.status === "members-only") {
    return (
      <div className="rounded-xl bg-amber-700 text-white px-4 py-3 text-sm">
        <span className="font-semibold">Members only</span>
        <span className="ml-2 opacity-90">
          {formatTime(hours.from)} – {formatTime(hours.to)} · {hours.reason}
        </span>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-rose-700 text-white px-4 py-3 text-sm">
      <span className="font-semibold">Closed for shooting</span>
      <span className="ml-2 opacity-90">· {hours.reason}</span>
    </div>
  );
}

export default function DayView({ date, events }: { date: Date; events: DayEvent[] }) {
  const hours = shootingHoursFor(date);
  const groups: Record<Venue, DayEvent[]> = {
    RP: [], TRAP: [], CLUBHOUSE: [], OTHER: [],
  };
  for (const e of events) groups[e.venue].push(e);

  const order: Venue[] = ["RP", "TRAP", "CLUBHOUSE", "OTHER"];

  return (
    <div className="space-y-4">
      <HoursBanner hours={hours} />
      <div className="grid gap-4 sm:grid-cols-2">
        {order.map((v) =>
          v === "OTHER" && groups.OTHER.length === 0 ? null : (
            <section
              key={v}
              className={`rounded-2xl border ${VENUE_COLORS[v]} p-4`}
            >
              <h2 className="flex items-center gap-2 font-semibold mb-3">
                <span className={`w-2 h-2 rounded-full ${VENUE_DOT[v]}`} />
                {VENUE_LABEL[v]}
              </h2>
              {groups[v].length === 0 ? (
                <p className="text-sm text-slate-500">Nothing scheduled.</p>
              ) : (
                <ul className="space-y-2">
                  {groups[v].map((e, i) => (
                    <li key={`${v}-${i}`} className="flex items-start gap-3">
                      <span className="font-mono text-sm tabular-nums text-slate-700 w-20 shrink-0">
                        {formatTime(e.from)}
                      </span>
                      <div className="text-sm flex-1 min-w-0">
                        <div className="font-medium">{e.event}</div>
                        <div className="text-slate-500 text-xs">
                          {e.exUse ? <span className="mr-2">{e.exUse}</span> : null}
                          {e.to ? <span className="mr-2">until {formatTime(e.to)}</span> : null}
                          {e.contact ? <span>{e.contact}</span> : null}
                          {e.source === "recurring" ? (
                            <span className="italic ml-1">· recurring</span>
                          ) : null}
                        </div>
                        <EventActions
                          date={isoLocal(date)}
                          time={e.from}
                          endTime={e.to}
                          title={e.event}
                          venue={e.venue}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ),
        )}
      </div>
    </div>
  );
}
