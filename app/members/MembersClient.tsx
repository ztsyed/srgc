"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import type { Member } from "@/lib/members-shared";
import { fullName, searchMembers } from "@/lib/members-shared";

const LEVEL_BADGE: Record<string, string> = {
  Full: "bg-blue-100 text-blue-800",
  Life: "bg-emerald-100 text-emerald-800",
  Associate: "bg-amber-100 text-amber-800",
  Probate: "bg-slate-200 text-slate-800",
  Special: "bg-violet-100 text-violet-800",
};

export default function MembersClient({ members }: { members: Member[] }) {
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const filtered = useMemo(() => searchMembers(members, dq), [members, dq]);

  return (
    <div className="space-y-4">
      <div className="sticky top-0 -mx-4 sm:mx-0 px-4 sm:px-0 pt-1 pb-3 bg-slate-50/90 backdrop-blur z-10">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, email, phone, clicker, organization…"
          className="w-full rounded-xl border bg-white px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          autoFocus
          inputMode="search"
        />
        <p className="text-xs text-slate-500 mt-1">
          {filtered.length} of {members.length} members
        </p>
      </div>

      <ul className="rounded-2xl border bg-white divide-y overflow-hidden">
        {filtered.length === 0 ? (
          <li className="p-6 text-sm text-slate-500 text-center">No matches.</li>
        ) : (
          filtered.slice(0, 200).map((m) => (
            <li key={m.id}>
              <Link
                href={`/members/${m.id}`}
                className="flex items-center gap-3 p-3 sm:p-4 hover:bg-slate-50"
              >
                <span className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-sm font-medium shrink-0">
                  {(m.firstName.charAt(0) + m.lastName.charAt(0)).toUpperCase() || "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{fullName(m)}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {[m.email, m.phone].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                    LEVEL_BADGE[m.membershipLevel] ?? "bg-slate-100 text-slate-700"
                  }`}
                >
                  {m.membershipLevel}
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
      {filtered.length > 200 ? (
        <p className="text-xs text-slate-500 text-center">
          Showing first 200 — refine your search to narrow down.
        </p>
      ) : null}
    </div>
  );
}
