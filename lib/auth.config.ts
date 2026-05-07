import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe NextAuth config used by middleware. Must not import anything
// that pulls in node:fs / node:path — middleware runs on the Edge runtime.
// The signIn callback that consults the allowlist file lives in lib/auth.ts.
export const authConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
