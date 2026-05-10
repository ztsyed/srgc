"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Tiny client-side beacon. On every route change it POSTs the new path to
// /api/usage/visit. Admins are filtered server-side, so we don't need to know
// who the user is here. We *do* dedupe within a single mount to avoid
// double-firing in React 18 strict mode and quick back-and-forth navigations.
export default function UsageLogger() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (pathname === lastSent.current) return;
    lastSent.current = pathname;

    // Skip auth + admin paths — they're either unauthenticated or excluded.
    if (pathname.startsWith("/api/") || pathname.startsWith("/signin")) return;

    const payload = JSON.stringify({ path: pathname });
    // Prefer sendBeacon when available — it survives page unload and doesn't
    // add to the request waterfall. Fall back to fetch otherwise.
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      try {
        const blob = new Blob([payload], { type: "application/json" });
        if (navigator.sendBeacon("/api/usage/visit", blob)) return;
      } catch {
        // fall through to fetch
      }
    }
    fetch("/api/usage/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // intentionally ignored — usage logging must not affect the user
    });
  }, [pathname]);

  return null;
}
