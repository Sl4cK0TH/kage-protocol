"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SVGProps } from "react";
import {
  IconAudit,
  IconClone,
  IconClose,
  IconDashboard,
  IconDocs,
  IconJutsu,
  IconSettings
} from "@/components/icons";

type IconType = (props: SVGProps<SVGSVGElement>) => JSX.Element;

export const navItems: { href: string; label: string; icon: IconType }[] = [
  { href: "/dashboard", label: "Dashboard", icon: IconDashboard },
  { href: "/dashboard/jutsus", label: "Jutsu Library", icon: IconJutsu },
  { href: "/dashboard/clones", label: "Active Clones", icon: IconClone },
  { href: "/dashboard/audit", label: "Audit Log", icon: IconAudit },
  { href: "/dashboard/settings", label: "Settings", icon: IconSettings },
  { href: "/dashboard/docs", label: "Documentation", icon: IconDocs }
];

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/70 transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        // Closed on small screens: off-canvas *and* invisible (after the slide
        // finishes) so its links leave the Tab order; always visible on lg+.
        className={`fixed left-0 top-0 z-50 h-screen w-64 border-r border-zinc-900 bg-zinc-950/95 px-6 py-8 [transition:transform_200ms_ease-out,visibility_0ms_linear_200ms] lg:visible lg:translate-x-0 ${
          open ? "visible translate-x-0 [transition:transform_200ms_ease-out]" : "invisible -translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.4em] text-emerald-300">Kage Protocol</p>
            <p className="font-display text-2xl text-white">Command Center</p>
            <p className="text-xs text-muted">CTF challenge control plane</p>
          </div>
          <button
            className="-m-2 rounded p-2 text-zinc-400 hover:text-zinc-200 lg:hidden"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>
        <nav className="mt-10 space-y-1 text-sm" aria-label="Main">
          {navItems.map((item) => {
            const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 transition ${
                  active
                    ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40 shadow-glow"
                    : "border border-transparent text-zinc-300 hover:text-emerald-200 hover:bg-zinc-900"
                }`}
              >
                <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${active ? "text-emerald-300" : "text-zinc-400"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
