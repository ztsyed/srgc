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
  newsletterMonth?: string; // YYYY-MM, latest uploaded newsletter
  variant?: "light" | "dark";
};

const STYLES = {
  light: "border-slate-300 hover:bg-slate-100",
  dark: "border-slate-600/70 hover:bg-slate-700 text-slate-100",
} as const;

export default function EventActions({
  date,
  time,
  endTime,
  title,
  venue,
  newsletterMonth,
  variant = "light",
}: Props) {
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

  const pill = `text-[11px] px-2 py-0.5 rounded-md border whitespace-nowrap inline-flex items-center gap-1 ${STYLES[variant]} disabled:opacity-50`;
  const okText = variant === "dark" ? "text-emerald-300" : "text-emerald-700";
  const errText = variant === "dark" ? "text-rose-300" : "text-rose-700";

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1">
      <button type="button" onClick={ntfy} disabled={pending} className={pill} aria-label="Notify me on the morning of this event">
        <span aria-hidden>🔔</span> Notify
      </button>
      <a href={icsHref} className={pill} aria-label="Download as calendar event">
        <span aria-hidden>📅</span> Calendar
      </a>
      {newsletterMonth ? (
        <a
          href={`/newsletters/${newsletterMonth}`}
          className={pill}
          aria-label="View this event's source newsletter"
        >
          <span aria-hidden>📰</span> Newsletter
        </a>
      ) : null}
      {msg ? (
        <span className={`text-[11px] whitespace-nowrap ${msg.ok ? okText : errText}`}>{msg.text}</span>
      ) : null}
    </div>
  );
}
