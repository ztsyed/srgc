import "./globals.css";
import type { Metadata, Viewport } from "next";
import { auth } from "@/lib/auth";
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
          />
        ) : null}
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
