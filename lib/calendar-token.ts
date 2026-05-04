import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Deterministic per-user calendar token. Same email always yields the same
// token, so users can subscribe once and the URL stays valid as long as
// AUTH_SECRET doesn't rotate. If AUTH_SECRET rotates, all tokens become
// invalid and users re-subscribe — acceptable.
export function tokenForEmail(email: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", secret)
    .update(`calendar:${email.toLowerCase()}`)
    .digest("base64url")
    .slice(0, 32);
}

export function emailFromToken(candidate: string, allowedEmails: string[]): string | null {
  if (!candidate || candidate.length !== 32) return null;
  const candidateBuf = Buffer.from(candidate);
  for (const email of allowedEmails) {
    const expected = Buffer.from(tokenForEmail(email));
    if (expected.length === candidateBuf.length && timingSafeEqual(expected, candidateBuf)) {
      return email;
    }
  }
  return null;
}

export function allowedEmailsFromEnv(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
