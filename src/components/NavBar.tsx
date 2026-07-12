"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/trips", label: "Trips" },
  { href: "/refuels", label: "Refuels" },
  { href: "/reports", label: "Reports" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the mobile menu on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on outside click / Escape while open.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const current = NAV.find((item) => isActive(pathname, item.href));

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--tt-border)] bg-[var(--background)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-8">
        <Link
          href="/"
          className="shrink-0 text-lg font-bold tracking-tight text-[var(--tt-accent)]"
        >
          TripTrack
        </Link>

        {/* Desktop / tablet: inline links */}
        <nav className="hidden gap-1 text-sm sm:flex">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "rounded-md px-3 py-1.5 font-medium text-[var(--tt-accent)]"
                    : "rounded-md px-3 py-1.5 text-[var(--tt-muted)] hover:bg-white/5 hover:text-foreground"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile: hamburger dropdown, pushed to the right */}
        <div ref={menuRef} className="relative ml-auto sm:hidden">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label="Menu"
            className="flex items-center gap-2 rounded-md border border-[var(--tt-border)] bg-[var(--tt-surface)] px-3 py-1.5 text-sm text-foreground"
          >
            <span className="text-[var(--tt-muted)]">
              {current?.label ?? "Menu"}
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`text-[var(--tt-muted)] transition-transform ${
                open ? "rotate-180" : ""
              }`}
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {open && (
            <nav className="absolute right-0 top-full z-30 mt-2 w-44 overflow-hidden rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-1 shadow-xl">
              {NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-[var(--tt-accent)] font-medium text-[var(--tt-accent-ink)]"
                        : "text-foreground hover:bg-white/5"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}
