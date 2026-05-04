import { signIn, auth } from "@/lib/auth";
import { redirect } from "next/navigation";

function sanitizeCallback(raw?: string): string {
  if (!raw) return "/";
  // Only allow same-origin relative paths starting with a single '/'.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const sp = await searchParams;
  const safeCallback = sanitizeCallback(sp.callbackUrl);
  if (session?.user) redirect(safeCallback);

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="bg-white shadow rounded-2xl p-8 max-w-md w-full text-center">
        <h1 className="text-2xl font-semibold mb-2">Sunnyvale Rod &amp; Gun Club</h1>
        <p className="text-slate-600 mb-6">Members area — please sign in.</p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: safeCallback });
          }}
        >
          <button
            type="submit"
            className="w-full py-3 px-4 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-700 transition"
          >
            Sign in with Google
          </button>
        </form>
        {sp.error ? (
          <p className="text-red-600 text-sm mt-4">
            {sp.error === "AccessDenied"
              ? "Your account is not on the allowlist."
              : `Sign-in error: ${sp.error}`}
          </p>
        ) : null}
      </div>
    </main>
  );
}
