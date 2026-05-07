"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOutAction } from "@/app/sign-out";

type NavUser = {
  name: string | null;
  email: string | null;
  image: string | null;
};

type NavLink = { href: string; label: string; adminOnly?: boolean };

const LINKS: ReadonlyArray<NavLink> = [
  { href: "/", label: "Today" },
  { href: "/chat", label: "Ask" },
  { href: "/calendar", label: "Calendar" },
  { href: "/members", label: "Members" },
  { href: "/handbook", label: "Handbook" },
  { href: "/newsletters", label: "Newsletters" },
  { href: "/settings", label: "Settings" },
  { href: "/admin", label: "Admin", adminOnly: true },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function Avatar({ user, size = 28 }: { user: NavUser; size?: number }) {
  const cls = "rounded-full flex-shrink-0";
  const style = { width: size, height: size };
  if (user.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.image} alt="" referrerPolicy="no-referrer" className={cls} style={style} />;
  }
  return (
    <span
      className={`${cls} bg-slate-700 flex items-center justify-center text-xs`}
      style={style}
    >
      {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
    </span>
  );
}

export default function Nav({
  user,
  isAdmin = false,
  waitlistCount = 0,
}: {
  user: NavUser;
  isAdmin?: boolean;
  waitlistCount?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visibleLinks = LINKS.filter((l) => !l.adminOnly || isAdmin);

  // Close the drawer whenever route changes (covers Link clicks).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="bg-slate-900 text-white sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 text-sm">
        <Link href="/" className="font-semibold mr-auto" onClick={() => setOpen(false)}>
          SRGC
        </Link>

        {/* Desktop links: only at md+ */}
        <nav className="hidden md:flex items-center gap-4">
          {visibleLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                isActive(pathname, l.href)
                  ? "text-white font-medium"
                  : "text-slate-300 hover:text-white"
              }
            >
              {l.label}
              {l.adminOnly && waitlistCount > 0 ? (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-amber-500 text-white text-xs font-medium align-middle">
                  {waitlistCount}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        {/* Avatar + Sign out: shown at md+ */}
        <div className="hidden md:flex items-center gap-3 pl-3 ml-1 border-l border-slate-700">
          <span className="inline-flex items-center gap-2">
            <Avatar user={user} />
            <span className="text-slate-200">{user.name ?? user.email}</span>
          </span>
          <form action={signOutAction}>
            <button type="submit" className="text-slate-300 hover:text-white" aria-label="Sign out">
              Sign out
            </button>
          </form>
        </div>

        {/* Hamburger: only on mobile */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-800 active:bg-slate-700"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? (
              <>
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </>
            ) : (
              <>
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {open ? (
        <div id="mobile-menu" className="md:hidden border-t border-slate-800 bg-slate-900">
          <ul className="max-w-5xl mx-auto px-2 py-2 flex flex-col">
            {visibleLinks.map((l) => {
              const active = isActive(pathname, l.href);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={`flex items-center justify-between px-3 py-3 rounded-lg text-base ${
                      active ? "bg-slate-800 text-white" : "text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    <span>{l.label}</span>
                    {l.adminOnly && waitlistCount > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-amber-500 text-white text-xs font-medium">
                        {waitlistCount}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="max-w-5xl mx-auto px-4 py-3 border-t border-slate-800 flex items-center gap-3">
            <Avatar user={user} size={32} />
            <span className="text-slate-200 truncate flex-1">{user.name ?? user.email}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="text-sm px-3 py-1.5 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </header>
  );
}
