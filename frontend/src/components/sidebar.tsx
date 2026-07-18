"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/jutsus", label: "Jutsu Library" },
  { href: "/dashboard/clones", label: "Active Clones" },
  { href: "/dashboard/audit", label: "Audit Log" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/docs", label: "Documentation" }
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
      <nav className="mt-10 space-y-2 text-sm">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-4 py-3 transition ${
                active
                  ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
                  : "text-zinc-400 hover:text-emerald-200 hover:bg-zinc-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
