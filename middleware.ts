import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PUBLIC = [
  "/signin",
  "/api/auth",
  "/api/cron",                  // protected by Bearer token, not session
  "/calendar/feed/",            // .ics feed protected by per-user URL token
  "/_next",
  "/favicon.ico",
  "/icon",
  "/apple-icon",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
