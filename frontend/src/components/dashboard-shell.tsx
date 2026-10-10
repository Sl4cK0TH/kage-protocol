"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type React from "react";
import { Sidebar, navItems } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

/**
 * Client shell that coordinates the collapsible mobile navigation between the
 * Topbar hamburger and the Sidebar. On lg+ the sidebar is always visible and
 * the content is offset by its width.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  // Per-page browser titles, so tabs and history entries are distinguishable.
  useEffect(() => {
    const label = navItems.find((item) => item.href === pathname)?.label;
    document.title = label ? `${label} · Kage Protocol` : "Kage Protocol";
  }, [pathname]);

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only z-[70] rounded-md bg-emerald-400 px-4 py-2 text-sm font-medium text-zinc-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-h-screen flex-col lg:ml-64">
        <Topbar onMenuClick={() => setNavOpen(true)} />
        <main id="main" tabIndex={-1} className="flex-1 space-y-8 px-4 py-6 focus:outline-none sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
