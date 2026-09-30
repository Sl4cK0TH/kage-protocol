"use client";

import { useState } from "react";
import type React from "react";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

/**
 * Client shell that coordinates the collapsible mobile navigation between the
 * Topbar hamburger and the Sidebar. On lg+ the sidebar is always visible and
 * the content is offset by its width.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-h-screen flex-col lg:ml-64">
        <Topbar onMenuClick={() => setNavOpen(true)} />
        <main className="flex-1 space-y-8 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
