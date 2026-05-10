import { promises as fs } from "node:fs";
import { auth } from "@/lib/auth";
import { HANDBOOK_PATH, ensureDataDirs } from "@/lib/paths";
import { logUsage } from "@/lib/usage";

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  await ensureDataDirs();
  try {
    const data = await fs.readFile(HANDBOOK_PATH);
    await logUsage({
      email: session.user.email,
      name: session.user.name,
      kind: "handbook",
      path: "/handbook/pdf",
    });
    return new Response(data, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="SRGC-Handbook.pdf"',
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
