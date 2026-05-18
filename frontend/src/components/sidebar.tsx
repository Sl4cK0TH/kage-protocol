"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Command Center" },
  { href: "/dashboard/jutsus", label: "Jutsu Library" },
  { href: "/dashboard/clones", label: "Clone Manager" },
  { href: "/dashboard/settings", label: "Chakra Control" },
  { href: "/dashboard/docs", label: "Documentation" }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-72 min-h-screen border-r border-slate-800/70 bg-obsidian/90 px-6 py-8">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.4em] text-neon">Kage Protocol</p>
        <h1 className="font-display text-2xl text-white">Command Center</h1>
      </div>
      <nav className="mt-10 space-y-3 text-sm">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-4 py-3 transition ${
                active
                  ? "bg-slate-800/70 text-neon shadow-glow"
                  : "text-slate-400 hover:text-neon hover:bg-slate-800/40"
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
