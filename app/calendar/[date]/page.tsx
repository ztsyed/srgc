import Link from "next/link";
import { notFound } from "next/navigation";
import DayView from "@/components/DayView";
import { eventsForDate } from "@/lib/events";

export const dynamic = "force-dynamic";

function parseDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

export default async function DayDetail({ params }: { params: Promise<{ date: string }> }) {
  const { date: dateStr } = await params;
  const date = parseDate(dateStr);
  if (!date) notFound();

  const events = await eventsForDate(date);
  const fmt = new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <header className="mb-4">
        <Link
          href={`/calendar?m=${ym}`}
          className="text-sm text-slate-500 hover:underline"
        >
          ← Back to calendar
        </Link>
        <h1 className="text-2xl sm:text-3xl font-semibold mt-1">{fmt.format(date)}</h1>
      </header>
      <DayView date={date} events={events} />
    </div>
  );
}
