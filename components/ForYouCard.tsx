"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Member } from "@/lib/members-shared";
import type { DutyAssignment } from "@/lib/duty-shared";
import EventActions from "./EventActions";

type Props = {
  member: Member;
  nextMeeting: Date | null;
  nextBoardMeeting: Date | null;
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
function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ForYouCard({ member, nextMeeting, nextBoardMeeting, nextWorkParty, nextDuty }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("foryou-collapsed") === "1") setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("foryou-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <section className="rounded-2xl border bg-slate-900 text-white p-4 sm:p-5">
      <header className="flex items-center gap-3">
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
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="foryou-content"
          className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs opacity-70 hover:bg-slate-800 hover:opacity-100"
        >
          {collapsed ? "Show" : "Hide"}
          <svg
            viewBox="0 0 20 20"
            className={`w-4 h-4 transition-transform ${collapsed ? "" : "rotate-180"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </header>

      {collapsed ? null : (
        <div id="foryou-content">
      <ul className="mt-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        <Row
          label="Next general meeting"
          when={nextMeeting ? `${fmtDate(nextMeeting)} · ${fmt12h("19:00")}` : "—"}
          actions={
            nextMeeting ? (
              <EventActions
                date={isoLocal(nextMeeting)}
                time="19:00"
                title="Club Meeting (Hybrid)"
                venue="CLUBHOUSE"
                variant="dark"
              />
            ) : null
          }
        />
        <Row
          label="Next board meeting"
          when={nextBoardMeeting ? `${fmtDate(nextBoardMeeting)} · ${fmt12h("18:00")}` : "—"}
          actions={
            nextBoardMeeting ? (
              <EventActions
                date={isoLocal(nextBoardMeeting)}
                time="18:00"
                title="Board Meeting (Hybrid)"
                venue="CLUBHOUSE"
                variant="dark"
              />
            ) : null
          }
        />
        <Row
          label="Next work party"
          when={nextWorkParty ? `${fmtDate(nextWorkParty)} · ${fmt12h("08:00")}` : "—"}
          actions={
            nextWorkParty ? (
              <EventActions
                date={isoLocal(nextWorkParty)}
                time="08:00"
                title="Work Party"
                venue="OTHER"
                variant="dark"
              />
            ) : null
          }
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
        </div>
      )}
    </section>
  );
}

function Row({
  label,
  when,
  actions,
}: {
  label: string;
  when: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <li className="rounded-xl bg-slate-800 p-3">
      <p className="text-xs opacity-60">{label}</p>
      <p className="font-medium mt-0.5">{when}</p>
      {actions ?? null}
    </li>
  );
}
