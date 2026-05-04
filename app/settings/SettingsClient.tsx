"use client";

import { useState, useTransition } from "react";
import type { Notification } from "@/lib/notifications";
import { cancelNotify } from "../actions/notify";
import { saveNtfy, sendTestNtfy } from "./actions";

type Props = {
  email: string;
  ntfyTopic: string;
  ntfyServer: string;
  calUrl: string;
  webcalUrl: string;
  pendingNotifications: Notification[];
};

type Result = { ok: boolean; message: string } | null;

export default function SettingsClient({
  email, ntfyTopic, ntfyServer, calUrl, webcalUrl, pendingNotifications,
}: Props) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result>(null);

  function run(fn: () => Promise<Result>) {
    setResult(null);
    start(async () => setResult(await fn()));
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setResult({ ok: true, message: "Copied to clipboard." }); }
    catch { setResult({ ok: false, message: "Copy failed — long-press to copy manually." }); }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <header>
        <p className="text-sm text-slate-500">Settings</p>
        <h1 className="text-2xl sm:text-3xl font-semibold">Notifications &amp; Calendar</h1>
        <p className="text-sm text-slate-500 mt-1">Signed in as {email}</p>
      </header>

      {result ? (
        <div className={`rounded-xl px-4 py-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-900 border border-emerald-200" : "bg-rose-50 text-rose-900 border border-rose-200"}`}>
          {result.message}
        </div>
      ) : null}

      <section className="rounded-2xl border bg-white p-4 sm:p-6 space-y-3">
        <h2 className="font-semibold">ntfy.sh push notifications</h2>
        <p className="text-sm text-slate-500">
          Pick any string for your topic — it acts as a shared password between
          this app and your phone. Then install the{" "}
          <a className="text-blue-700 underline" href="https://ntfy.sh/" target="_blank" rel="noreferrer">
            ntfy app
          </a>{" "}
          and subscribe to the same topic.
        </p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => saveNtfy(fd));
          }}
        >
          <label className="block text-sm">
            <span className="block text-slate-700 mb-1">Topic</span>
            <input
              name="topic"
              defaultValue={ntfyTopic}
              placeholder="e.g. srgc-zia-9f4e"
              pattern="[A-Za-z0-9_\-]+"
              maxLength={64}
              className="block w-full rounded-lg border px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700 mb-1">Server (leave blank for ntfy.sh)</span>
            <input
              name="server"
              defaultValue={ntfyServer}
              placeholder="https://ntfy.sh"
              className="block w-full rounded-lg border px-3 py-2 text-sm font-mono"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={pending || !ntfyTopic}
              onClick={() => run(() => sendTestNtfy())}
              className="px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-50"
            >
              Send test
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border bg-white p-4 sm:p-6 space-y-3">
        <h2 className="font-semibold">Subscribe to the SRGC calendar</h2>
        <p className="text-sm text-slate-500">
          Add this feed to your phone's calendar — events appear automatically and
          stay updated as new newsletters are uploaded.
        </p>

        <div className="space-y-2">
          <p className="text-xs text-slate-500">iOS / macOS (one-tap subscribe):</p>
          <div className="flex items-center gap-2">
            <a
              href={webcalUrl}
              className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium"
            >
              Subscribe in Calendar
            </a>
            <button
              type="button"
              onClick={() => copy(webcalUrl)}
              className="px-3 py-2 rounded-lg border text-sm hover:bg-slate-50"
            >
              Copy webcal://
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            Android / Google Calendar — copy this URL, then in Google Calendar (web)
            choose &ldquo;Add calendar → From URL&rdquo;:
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={calUrl}
              className="flex-1 rounded-lg border px-3 py-2 text-xs font-mono bg-slate-50"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={() => copy(calUrl)}
              className="px-3 py-2 rounded-lg border text-sm hover:bg-slate-50"
            >
              Copy
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          The URL contains a personal token tied to your email. Don&apos;t share it.
        </p>
      </section>

      <section className="rounded-2xl border bg-white p-4 sm:p-6 space-y-3">
        <h2 className="font-semibold">Pending notifications</h2>
        {pendingNotifications.length === 0 ? (
          <p className="text-sm text-slate-500">
            None. Tap &ldquo;🔔 Notify me&rdquo; on any event to add one.
          </p>
        ) : (
          <ul className="divide-y">
            {pendingNotifications.map((n) => (
              <li key={n.id} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{n.eventTitle}</p>
                  <p className="text-xs text-slate-500">
                    {n.eventDate} · {n.eventTime} · {n.venue}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => cancelNotify(n.id))}
                  className="text-sm px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
