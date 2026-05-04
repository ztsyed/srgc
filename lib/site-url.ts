// Centralised origin lookup. In production NEXTAUTH_URL is injected by the
// Helm chart from `host`; locally it's set in `.env.local`. Falls back to the
// dev port so tools that need an absolute URL (ICS feed, ntfy click) still
// work in `npm run dev`.
export function siteUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
