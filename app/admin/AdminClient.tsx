"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  uploadNewsletter,
  reparseMonth,
  reparseDuty,
  deleteMonth,
  uploadHandbook,
  uploadMembersCsv,
  approveWaitlistEntry,
  denyWaitlistEntry,
  removeAllowedEntry,
} from "./actions";
import type { AllowlistEntry } from "@/lib/allowlist";
import type { WaitlistEntry } from "@/lib/waitlist";

type Result = { ok: boolean; message: string } | null;

export default function AdminClient({
  months,
  handbookKB,
  membersCount,
  membersUploadedAt,
  allowlist,
  waitlist,
  currentAdminEmail,
}: {
  months: string[];
  handbookKB: number | null;
  membersCount: number;
  membersUploadedAt: string | null;
  allowlist: AllowlistEntry[];
  waitlist: WaitlistEntry[];
  currentAdminEmail: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  function run(id: string, fn: () => Promise<Result>) {
    setResult(null);
    setRunningId(id);
    startTransition(async () => {
      try {
        setResult(await fn());
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setResult({ ok: false, message: `Request failed: ${msg}` });
      } finally {
        setRunningId(null);
      }
    });
  }
  const isRunning = (id: string) => runningId === id;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Admin</p>
          <h1 className="text-2xl sm:text-3xl font-semibold">Manage Newsletters &amp; Handbook</h1>
        </div>
        <Link
          href="/admin/usage"
          className="text-sm px-3 py-1.5 rounded-lg border hover:bg-slate-50 whitespace-nowrap"
        >
          Member usage →
        </Link>
      </header>

      {result ? (
        <div
          role="status"
          className={`rounded-xl px-4 py-3 text-sm ${
            result.ok ? "bg-emerald-50 text-emerald-900 border border-emerald-200" : "bg-rose-50 text-rose-900 border border-rose-200"
          }`}
        >
          {result.message}
        </div>
      ) : null}

      <section className="rounded-2xl border bg-white p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">
            Pending sign-in requests
            {waitlist.length > 0 ? (
              <span className="ml-2 inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-amber-500 text-white text-xs font-medium">
                {waitlist.length}
              </span>
            ) : null}
          </h2>
        </div>
        {waitlist.length === 0 ? (
          <p className="text-sm text-slate-500">No pending requests.</p>
        ) : (
          <ul className="divide-y">
            {waitlist.map((w) => (
              <li key={w.email} className="py-3 flex items-center gap-3">
                {w.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.image} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full flex-shrink-0" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs flex-shrink-0">
                    {(w.name ?? w.email).charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{w.name ?? w.email}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {w.email} · {w.attemptCount} {w.attemptCount === 1 ? "attempt" : "attempts"} · last {new Date(w.lastSeenAt).toLocaleString()}
                  </div>
                </div>
                <button
                  disabled={pending}
                  className="text-sm px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  onClick={() => run(`approve-${w.email}`, () => approveWaitlistEntry(w.email))}
                >
                  {isRunning(`approve-${w.email}`) ? "Approving…" : "Approve"}
                </button>
                <button
                  disabled={pending}
                  className="text-sm px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  onClick={() => {
                    if (confirm(`Dismiss ${w.email}? They can re-request by signing in again.`)) {
                      run(`dismiss-${w.email}`, () => denyWaitlistEntry(w.email));
                    }
                  }}
                >
                  {isRunning(`dismiss-${w.email}`) ? "Dismissing…" : "Dismiss"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 sm:p-6">
        <h2 className="font-semibold mb-3">Approved members ({allowlist.length})</h2>
        {allowlist.length === 0 ? (
          <p className="text-sm text-slate-500">Nobody is on the allowlist.</p>
        ) : (
          <ul className="divide-y">
            {allowlist.map((a) => {
              const isSelf = currentAdminEmail !== null && a.email === currentAdminEmail;
              return (
                <li key={a.email} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.name ?? a.email}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {a.email} · approved {new Date(a.approvedAt).toLocaleDateString()}
                      {a.approvedBy ? ` by ${a.approvedBy}` : ""}
                      {isSelf ? " · you" : ""}
                    </div>
                  </div>
                  <button
                    disabled={pending || isSelf}
                    className="text-sm px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    onClick={() => {
                      if (confirm(`Revoke access for ${a.email}?`)) {
                        run(`remove-${a.email}`, () => removeAllowedEntry(a.email));
                      }
                    }}
                  >
                    {isRunning(`remove-${a.email}`) ? "Removing…" : "Remove"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 sm:p-6 space-y-4">
        <h2 className="font-semibold">Upload monthly newsletter</h2>
        <p className="text-sm text-slate-500">
          Drop the PDF — Claude will extract the &ldquo;Upcoming Events&rdquo; table.
        </p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run("upload-newsletter", () => uploadNewsletter(fd));
          }}
        >
          <input type="file" name="file" accept="application/pdf" required className="block text-sm" />
          <input
            type="text"
            name="month"
            placeholder="Month override (YYYY-MM, optional)"
            pattern="\d{4}-\d{2}"
            className="block w-full sm:w-60 rounded-lg border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {isRunning("upload-newsletter") ? "Working…" : "Upload & parse"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border bg-white p-4 sm:p-6">
        <h2 className="font-semibold mb-3">Ingested months</h2>
        {months.length === 0 ? (
          <p className="text-sm text-slate-500">None yet.</p>
        ) : (
          <ul className="divide-y">
            {months.map((m) => (
              <li key={m} className="py-3 flex items-center gap-3">
                <span className="font-mono text-sm flex-1">{m}</span>
                <button
                  disabled={pending}
                  className="text-sm px-3 py-1.5 rounded-lg border hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => run(`reparse-events-${m}`, () => reparseMonth(m))}
                >
                  {isRunning(`reparse-events-${m}`) ? "Re-parsing…" : "Re-parse events"}
                </button>
                <button
                  disabled={pending}
                  className="text-sm px-3 py-1.5 rounded-lg border hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => run(`reparse-duty-${m}`, () => reparseDuty(m))}
                >
                  {isRunning(`reparse-duty-${m}`) ? "Re-parsing…" : "Re-parse duty"}
                </button>
                <button
                  disabled={pending}
                  className="text-sm px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  onClick={() => {
                    if (confirm(`Delete ${m}?`)) run(`delete-${m}`, () => deleteMonth(m));
                  }}
                >
                  {isRunning(`delete-${m}`) ? "Deleting…" : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 sm:p-6 space-y-3">
        <h2 className="font-semibold">Members CSV</h2>
        <p className="text-sm text-slate-500">
          {membersCount > 0
            ? `${membersCount} members loaded${membersUploadedAt ? ` · last upload ${new Date(membersUploadedAt).toLocaleString()}` : ""}.`
            : "No members loaded."}
          {" "}Upload a new CSV to replace the entire roster.
        </p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run("upload-members", () => uploadMembersCsv(fd));
          }}
        >
          <input type="file" name="file" accept=".csv,text/csv" required className="block text-sm" />
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {isRunning("upload-members") ? "Uploading…" : "Upload CSV"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border bg-white p-4 sm:p-6 space-y-3">
        <h2 className="font-semibold">Handbook PDF</h2>
        <p className="text-sm text-slate-500">
          Current: {handbookKB ? `${handbookKB} KB` : "not uploaded"}.
        </p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run("upload-handbook", () => uploadHandbook(fd));
          }}
        >
          <input type="file" name="file" accept="application/pdf" required className="block text-sm" />
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {isRunning("upload-handbook") ? "Uploading…" : "Replace handbook"}
          </button>
        </form>
      </section>
    </div>
  );
}
