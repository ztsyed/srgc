import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { logUsage } from "@/lib/usage";

export const runtime = "nodejs";

// Minimal POST endpoint hit by the client UsageLogger on every route change.
// Body: { path: string }. Auth is required — anonymous hits are dropped.
// Admins are filtered out inside logUsage(), not here, so the client beacon
// itself stays oblivious to who is admin.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return new Response(null, { status: 204 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const path =
    typeof body === "object" && body !== null && typeof (body as { path?: unknown }).path === "string"
      ? (body as { path: string }).path
      : null;
  if (!path || !path.startsWith("/")) return new Response("Bad path", { status: 400 });

  await logUsage({
    email: session.user.email,
    name: session.user.name,
    kind: "page",
    path,
  });
  return new Response(null, { status: 204 });
}
