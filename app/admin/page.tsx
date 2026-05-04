import { listIngestedMonths } from "@/lib/events";
import { promises as fs } from "node:fs";
import { HANDBOOK_PATH, ensureDataDirs } from "@/lib/paths";
import { loadMembersFile } from "@/lib/members";
import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await ensureDataDirs();
  const months = await listIngestedMonths();
  let handbookSize: number | null = null;
  try {
    const stat = await fs.stat(HANDBOOK_PATH);
    handbookSize = stat.size;
  } catch {}
  const membersFile = await loadMembersFile();
  return (
    <AdminClient
      months={months}
      handbookKB={handbookSize ? Math.round(handbookSize / 1024) : null}
      membersCount={membersFile?.members.length ?? 0}
      membersUploadedAt={membersFile?.uploadedAt ?? null}
    />
  );
}
