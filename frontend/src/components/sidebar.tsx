"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SVGProps } from "react";
import {
  IconAudit,
  IconClone,
  IconDashboard,
  IconDocs,
  IconJutsu,
  IconSettings
} from "@/components/icons";

type IconType = (props: SVGProps<SVGSVGElement>) => JSX.Element;

const navItems: { href: string; label: string; icon: IconType }[] = [
  { href: "/dashboard", label: "Dashboard", icon: IconDashboard },
  { href: "/dashboard/jutsus", label: "Jutsu Library", icon: IconJutsu },
  { href: "/dashboard/clones", label: "Active Clones", icon: IconClone },
  { href: "/dashboard/audit", label: "Audit Log", icon: IconAudit },
  { href: "/dashboard/settings", label: "Settings", icon: IconSettings },
  { href: "/dashboard/docs", label: "Documentation", icon: IconDocs }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-zinc-900 bg-zinc-950/90 px-6 py-8">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.4em] text-emerald-300">Kage Protocol</p>
        <h1 className="font-display text-2xl text-white">Command Center</h1>
        <p className="text-xs text-zinc-500">Enterprise control plane</p>
      </div>
      <nav className="mt-10 space-y-1 text-sm">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 transition ${
                active
                  ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40 shadow-glow"
                  : "border border-transparent text-zinc-400 hover:text-emerald-200 hover:bg-zinc-900"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? "text-emerald-300" : "text-zinc-500"}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
