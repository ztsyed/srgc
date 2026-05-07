import "./globals.css";
import type { Metadata, Viewport } from "next";
import { auth, isAdmin } from "@/lib/auth";
import { waitlistCount } from "@/lib/waitlist";
import Nav from "@/components/Nav";

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
  const admin = isAdmin(session?.user?.email);
  const pending = admin ? await waitlistCount() : 0;
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        {session?.user ? (
          <Nav
            user={{
              name: session.user.name ?? null,
              email: session.user.email ?? null,
              image: session.user.image ?? null,
            }}
            isAdmin={admin}
            waitlistCount={pending}
          />
        ) : null}
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
