import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

export const metadata: Metadata = {
  title: "SRGC Today",
  description: "Sunnyvale Rod & Gun Club — today at the range",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        {session?.user ? (
          <header className="bg-slate-900 text-white">
            <nav className="max-w-3xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-4 text-sm">
              <Link href="/" className="font-semibold mr-auto">SRGC</Link>
              <Link href="/" className="hover:underline">Today</Link>
              <Link href="/chat" className="hover:underline">Ask</Link>
              <Link href="/calendar" className="hover:underline">Calendar</Link>
              <Link href="/members" className="hover:underline">Members</Link>
              <Link href="/handbook" className="hover:underline">Handbook</Link>
              <Link href="/settings" className="hover:underline">Settings</Link>
              <Link href="/admin" className="hover:underline">Admin</Link>
              <span className="ml-2 inline-flex items-center gap-2 pl-3 border-l border-slate-700">
                {session.user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.image}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-full"
                  />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs">
                    {(session.user.name ?? session.user.email ?? "?").charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="hidden sm:inline text-slate-200">
                  {session.user.name ?? session.user.email}
                </span>
              </span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/signin" });
                }}
              >
                <button
                  type="submit"
                  className="text-slate-300 hover:text-white"
                  aria-label="Sign out"
                >
                  Sign out
                </button>
              </form>
            </nav>
          </header>
        ) : null}
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
