import DayView from "@/components/DayView";
import ForYouCard from "@/components/ForYouCard";
import { eventsForDate } from "@/lib/events";
import { findNextDutyForMember } from "@/lib/duty";
import { getCurrentMember, nextRecurrence } from "@/lib/me";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const now = new Date();
  const [events, member] = await Promise.all([eventsForDate(now), getCurrentMember()]);

  const nextMeeting = nextRecurrence(now, /* Thu */ 4, /* 1st */ 1);
  const nextWorkParty = nextRecurrence(now, /* Sun */ 0, /* 2nd */ 2);
  const nextDuty = member ? await findNextDutyForMember(member, now) : null;

  const fmt = new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <header>
        <p className="text-sm text-slate-500">Today</p>
        <h1 className="text-2xl sm:text-3xl font-semibold">{fmt.format(now)}</h1>
      </header>
      {member ? (
        <ForYouCard
          member={member}
          nextMeeting={nextMeeting}
          nextWorkParty={nextWorkParty}
          nextDuty={nextDuty}
        />
      ) : null}
      <DayView date={now} events={events} />
    </div>
  );
}
