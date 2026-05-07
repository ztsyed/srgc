import "server-only";
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { isAllowed } from "./allowlist";
import { recordDenial } from "./waitlist";

// Computed once at module load. ADMIN_EMAILS only changes via pod restart
// (env var sourced from a k8s Secret), so caching is safe.
const ADMIN_SET: ReadonlySet<string> = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_SET.has(email.toLowerCase());
}

export function adminEmailsList(): string[] {
  return Array.from(ADMIN_SET);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      // Admins are always allowed — bootstrap safety net so a corrupted
      // allowlist.json can't lock the operator out of /admin.
      if (isAdmin(email)) return true;
      if (await isAllowed(email)) return true;
      // Denied — record on the waitlist for admin review. Swallow errors
      // so a write failure doesn't break the OAuth callback.
      try {
        await recordDenial({ email, name: user.name, image: user.image });
      } catch {
        // intentionally ignored
      }
      return false;
    },
  },
});
