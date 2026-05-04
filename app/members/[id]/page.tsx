import Link from "next/link";
import { notFound } from "next/navigation";
import { fullName, loadMembersFile } from "@/lib/members";

export const dynamic = "force-dynamic";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthLabel(n: string): string {
  const i = parseInt(n, 10);
  return Number.isInteger(i) && i >= 1 && i <= 12 ? MONTHS[i] : n;
}

export default async function MemberDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = await loadMembersFile();
  const m = file?.members?.find((x) => x.id === id);
  if (!m) notFound();

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      <Link href="/members" className="text-sm text-slate-500 hover:underline">
        ← Back to roster
      </Link>

      <div className="mt-3 rounded-2xl border bg-white overflow-hidden">
        <div className="flex items-center gap-4 p-4 sm:p-6 bg-slate-900 text-white">
          <span className="w-14 h-14 rounded-full bg-slate-700 flex items-center justify-center text-xl font-semibold shrink-0">
            {(m.firstName.charAt(0) + m.lastName.charAt(0)).toUpperCase() || "?"}
          </span>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold truncate">{fullName(m)}</h1>
            <p className="text-sm opacity-80">{m.membershipLevel}{m.subStatus ? ` · ${m.subStatus}` : ""}</p>
          </div>
        </div>

        <dl className="divide-y">
          <Field label="Email">
            {m.email ? <a href={`mailto:${m.email}`} className="text-blue-700 underline break-all">{m.email}</a> : <span className="text-slate-400">—</span>}
          </Field>
          <Field label="Phone">
            {m.phone ? <a href={`tel:${m.phone.replace(/[^\d+]/g, "")}`} className="text-blue-700 underline">{m.phone}</a> : <span className="text-slate-400">—</span>}
          </Field>
          <Field label="Joined">{m.joinDate || <span className="text-slate-400">—</span>}</Field>
          <Field label="Range duty">
            {[m.rangeDuty, m.rangeDutyAMPM, m.rangeDutyDay].filter((s) => s && s !== "N/A").join(" · ") || <span className="text-slate-400">—</span>}
          </Field>
          <Field label="Work party">
            {m.workPartyMonth ? monthLabel(m.workPartyMonth) : <span className="text-slate-400">—</span>}
          </Field>
          <Field label="Clicker">{m.clickerNumber || <span className="text-slate-400">—</span>}</Field>
          {m.organization ? <Field label="Organization">{m.organization}</Field> : null}
          <Field label="Wild Apricot profile">
            <a href={m.profileUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">Open profile ↗</a>
          </Field>
        </dl>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 sm:px-6 py-3 grid grid-cols-3 gap-4 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2">{children}</dd>
    </div>
  );
}
