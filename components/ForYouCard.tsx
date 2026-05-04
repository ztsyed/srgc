import Link from "next/link";
import type { Member } from "@/lib/members-shared";
import type { DutyAssignment } from "@/lib/duty-shared";

type Props = {
  member: Member;
  nextMeeting: Date | null;
  nextWorkParty: Date | null;
  nextDuty: { assignment: DutyAssignment; strict: boolean } | null;
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(d: Date): string {
  return `${DOW[d.getDay()]} ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}
function fmt12h(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
function dutyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return fmtDate(new Date(y, m - 1, d));
}

export default function ForYouCard({ member, nextMeeting, nextWorkParty, nextDuty }: Props) {
  return (
    <section className="rounded-2xl border bg-slate-900 text-white p-4 sm:p-5">
      <header className="mb-3 flex items-center gap-3">
        <span
          aria-label={`${member.firstName} ${member.lastName}`.trim() || "member"}
          className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-semibold"
        >
          {(member.firstName.charAt(0) + member.lastName.charAt(0)).toUpperCase() || "?"}
        </span>
        <div>
          <p className="text-xs uppercase tracking-wide opacity-60">For you</p>
          <h2 className="text-base sm:text-lg font-semibold">{member.firstName} {member.lastName}</h2>
        </div>
      </header>

      <ul className="grid sm:grid-cols-3 gap-3 text-sm">
        <Row
          label="Next general meeting"
          when={nextMeeting ? `${fmtDate(nextMeeting)} · ${fmt12h("19:00")}` : "—"}
        />
        <Row
          label="Next work party"
          when={nextWorkParty ? `${fmtDate(nextWorkParty)} · ${fmt12h("08:00")}` : "—"}
        />
        <Row
          label="My next range duty"
          when={
            nextDuty ? (
              <>
                {dutyDate(nextDuty.assignment.date)}
                {" · "}
                {nextDuty.assignment.role}
                {nextDuty.assignment.ampm && nextDuty.assignment.ampm !== "ALL"
                  ? ` (${nextDuty.assignment.ampm})`
                  : ""}
                {!nextDuty.strict ? (
                  <span className="block text-xs text-amber-300 mt-0.5">
                    Matched on last name only — listed as &ldquo;{nextDuty.assignment.rawName}&rdquo;
                  </span>
                ) : null}
              </>
            ) : (
              <span className="opacity-60">No upcoming duty found</span>
            )
          }
        />
      </ul>

      <p className="text-xs opacity-60 mt-3">
        <Link className="underline" href={`/members/${member.id}`}>Your profile</Link>
        {nextDuty == null ? <span className="ml-2">· need duty data? Re-parse latest newsletter on /admin.</span> : null}
      </p>
    </section>
  );
}

function Row({ label, when }: { label: string; when: React.ReactNode }) {
  return (
    <li className="rounded-xl bg-slate-800 p-3">
      <p className="text-xs opacity-60">{label}</p>
      <p className="font-medium mt-0.5">{when}</p>
    </li>
  );
}
