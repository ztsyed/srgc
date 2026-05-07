import { listIngestedMonths } from "@/lib/events";
import { promises as fs } from "node:fs";
import { redirect } from "next/navigation";
import { auth, isAdmin } from "@/lib/auth";
import { HANDBOOK_PATH, ensureDataDirs } from "@/lib/paths";
import { loadMembersFile } from "@/lib/members";
import { loadAllowlist } from "@/lib/allowlist";
import { loadWaitlist } from "@/lib/waitlist";
import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) redirect("/");

  await ensureDataDirs();
  const months = await listIngestedMonths();
  let handbookSize: number | null = null;
  try {
    const stat = await fs.stat(HANDBOOK_PATH);
    handbookSize = stat.size;
  } catch {}
  const membersFile = await loadMembersFile();
  const allowlist = await loadAllowlist();
  const waitlist = await loadWaitlist();
  return (
    <AdminClient
      months={months}
      handbookKB={handbookSize ? Math.round(handbookSize / 1024) : null}
      membersCount={membersFile?.members.length ?? 0}
      membersUploadedAt={membersFile?.uploadedAt ?? null}
      allowlist={allowlist.entries}
      waitlist={waitlist.entries}
      currentAdminEmail={session?.user?.email?.toLowerCase() ?? null}
    />
  );
}
