"use client";

import { useState, useTransition } from "react";
import type { Venue } from "@/lib/types";
import { notifyMe } from "../app/actions/notify";

type Props = {
  date: string;          // YYYY-MM-DD
  time: string;          // HH:MM
  endTime?: string;
  title: string;
  venue: Venue;
};

export default function EventActions({ date, time, endTime, title, venue }: Props) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const icsHref = `/api/event-ics?date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}${
    endTime ? `&end=${encodeURIComponent(endTime)}` : ""
  }&title=${encodeURIComponent(title)}&venue=${venue}`;

  function ntfy() {
    setMsg(null);
    start(async () => {
      const res = await notifyMe({ eventDate: date, eventTitle: title, eventTime: time, venue });
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  return (
    <div className="flex items-center gap-1.5 mt-1">
      <button
        type="button"
        onClick={ntfy}
        disabled={pending}
        className="text-[11px] px-2 py-0.5 rounded-md border border-slate-300 hover:bg-slate-100 disabled:opacity-50"
        aria-label="Notify me on the morning of this event"
      >
        🔔 Notify me
      </button>
      <a
        href={icsHref}
        className="text-[11px] px-2 py-0.5 rounded-md border border-slate-300 hover:bg-slate-100"
        aria-label="Download as calendar event"
      >
        📅 Add to calendar
      </a>
      {msg ? (
        <span className={`text-[11px] ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>
          {msg.text}
        </span>
      ) : null}
    </div>
  );
}
