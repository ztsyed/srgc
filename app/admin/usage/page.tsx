import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, isAdmin } from "@/lib/auth";
import { readUsage, recentMonths, type UsageEntry } from "@/lib/usage";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<UsageEntry["kind"], string> = {
  page: "Page",
  newsletter: "Newsletter PDF",
  ics: "Calendar export",
  handbook: "Handbook PDF",
  "calendar-feed": "iCal feed",
};
const KIND_BADGE: Record<UsageEntry["kind"], string> = {
  page: "bg-slate-100 text-slate-700",
  newsletter: "bg-blue-100 text-blue-800",
  ics: "bg-emerald-100 text-emerald-800",
  handbook: "bg-amber-100 text-amber-800",
  "calendar-feed": "bg-violet-100 text-violet-800",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; months?: string }>;
}) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) redirect("/");

  const sp = await searchParams;
  const monthCount = Math.min(Math.max(parseInt(sp.months ?? "2", 10) || 2, 1), 12);
  const emailFilter = sp.email?.toLowerCase().trim() || null;

  const months = recentMonths(new Date(), monthCount);
  const all = await readUsage(months);
  const filtered = emailFilter ? all.filter((e) => e.email === emailFilter) : all;

  // Per-user summary for the visible window.
  const byUser = new Map<string, { name: string | null; count: number; last: string }>();
  for (const e of all) {
    const existing = byUser.get(e.email);
    if (!existing) byUser.set(e.email, { name: e.name, count: 1, last: e.ts });
    else {
      existing.count += 1;
      if (e.ts > existing.last) existing.last = e.ts;
    }
  }
  const users = Array.from(byUser.entries()).sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <header>
        <p className="text-sm text-slate-500">
          <Link href="/admin" className="hover:underline">Admin</Link>
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold">Member usage</h1>
        <p className="text-sm text-slate-500 mt-1">
          Showing the last {monthCount} {monthCount === 1 ? "month" : "months"}
          {emailFilter ? <> · filtered to <span className="font-mono">{emailFilter}</span></> : null}
          . Your own activity is excluded.
        </p>
      </header>

      <section className="rounded-2xl border bg-white p-4 sm:p-6">
        <h2 className="font-semibold mb-3">By member ({users.length})</h2>
        {users.length === 0 ? (
          <p className="text-sm text-slate-500">No member activity recorded yet.</p>
        ) : (
          <ul className="divide-y">
            {users.map(([email, info]) => (
              <li key={email} className="py-2 flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{info.name ?? email}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {email} · last seen {fmtTime(info.last)}
                  </div>
                </div>
                <span className="font-mono tabular-nums text-slate-700">{info.count}</span>
                <Link
                  href={`/admin/usage?email=${encodeURIComponent(email)}&months=${monthCount}`}
                  className="text-xs text-blue-700 hover:underline"
                >
                  view
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="font-semibold">
            Recent activity {emailFilter ? null : "(all members)"}
            <span className="ml-2 text-xs text-slate-500 font-normal">
              {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
            </span>
          </h2>
          {emailFilter ? (
            <Link href={`/admin/usage?months=${monthCount}`} className="text-xs text-blue-700 hover:underline">
              clear filter
            </Link>
          ) : null}
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing to show.</p>
        ) : (
          <ul className="divide-y text-sm">
            {filtered.slice(0, 500).map((e, i) => (
              <li key={`${e.ts}-${i}`} className="py-2 flex items-start gap-3">
                <span className="text-xs text-slate-500 tabular-nums w-28 shrink-0 mt-0.5">
                  {fmtTime(e.ts)}
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium shrink-0 ${KIND_BADGE[e.kind]}`}>
                  {KIND_LABEL[e.kind]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="truncate">
                    <span className="font-mono text-xs">{e.path}</span>
                    {e.detail ? <span className="text-slate-500 ml-2">· {e.detail}</span> : null}
                  </div>
                  {!emailFilter ? (
                    <div className="text-xs text-slate-500 truncate">
                      {e.name ? `${e.name} · ` : ""}{e.email}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {filtered.length > 500 ? (
          <p className="text-xs text-slate-500 mt-3">
            Showing the most recent 500 entries. Increase the window with
            <Link href={`/admin/usage?months=${Math.min(monthCount + 1, 12)}${emailFilter ? `&email=${emailFilter}` : ""}`} className="ml-1 text-blue-700 hover:underline">
              +1 month
            </Link>
            {" "}to load older history.
          </p>
        ) : null}
      </section>

      <p className="text-xs text-slate-500">
        <Link href={`/admin/usage?months=${Math.min(monthCount + 1, 12)}${emailFilter ? `&email=${emailFilter}` : ""}`} className="text-blue-700 hover:underline">
          Show one more month
        </Link>
      </p>
    </div>
  );
}
