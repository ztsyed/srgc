"use client";

import { useState, useTransition } from "react";
import { uploadNewsletter, reparseMonth, reparseDuty, deleteMonth, uploadHandbook, uploadMembersCsv } from "./actions";

type Result = { ok: boolean; message: string } | null;

export default function AdminClient({
  months,
  handbookKB,
  membersCount,
  membersUploadedAt,
}: {
  months: string[];
  handbookKB: number | null;
  membersCount: number;
  membersUploadedAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result>(null);

  function run(fn: () => Promise<Result>) {
    setResult(null);
    startTransition(async () => setResult(await fn()));
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <header>
        <p className="text-sm text-slate-500">Admin</p>
        <h1 className="text-2xl sm:text-3xl font-semibold">Manage Newsletters &amp; Handbook</h1>
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
            run(() => uploadNewsletter(fd));
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
            {pending ? "Working…" : "Upload & parse"}
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
                  onClick={() => run(() => reparseMonth(m))}
                >
                  Re-parse events
                </button>
                <button
                  disabled={pending}
                  className="text-sm px-3 py-1.5 rounded-lg border hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => run(() => reparseDuty(m))}
                >
                  Re-parse duty
                </button>
                <button
                  disabled={pending}
                  className="text-sm px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  onClick={() => {
                    if (confirm(`Delete ${m}?`)) run(() => deleteMonth(m));
                  }}
                >
                  Delete
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
            run(() => uploadMembersCsv(fd));
          }}
        >
          <input type="file" name="file" accept=".csv,text/csv" required className="block text-sm" />
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Uploading…" : "Upload CSV"}
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
            run(() => uploadHandbook(fd));
          }}
        >
          <input type="file" name="file" accept="application/pdf" required className="block text-sm" />
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Uploading…" : "Replace handbook"}
          </button>
        </form>
      </section>
    </div>
  );
}
