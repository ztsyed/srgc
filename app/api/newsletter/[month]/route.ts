import { promises as fs } from "node:fs";
import { auth } from "@/lib/auth";
import { newsletterPdfPath, ensureDataDirs } from "@/lib/paths";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ month: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { month } = await params;
  // Strict YYYY-MM guard so the param can't escape PDF_DIR via traversal.
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return new Response("Bad request", { status: 400 });
  }

  await ensureDataDirs();
  try {
    const data = await fs.readFile(newsletterPdfPath(month));
    return new Response(data, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="SRGC-${month}.pdf"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
