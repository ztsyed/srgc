import { loadMembersFile, type Member } from "@/lib/members";
import MembersClient from "./MembersClient";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const file = await loadMembersFile();
  const members: Member[] = file?.members ?? [];
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <header className="mb-4">
        <p className="text-sm text-slate-500">Roster</p>
        <h1 className="text-2xl sm:text-3xl font-semibold">Members</h1>
        <p className="text-sm text-slate-500 mt-1">
          {members.length === 0
            ? "No members loaded yet — upload the CSV from /admin."
            : `${members.length} members.`}
        </p>
      </header>
      {members.length > 0 ? <MembersClient members={members} /> : null}
    </div>
  );
}
