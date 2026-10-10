"use client";

import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { IconLogout, IconMenu } from "@/components/icons";
import { navItems } from "@/components/sidebar";
import { apiRequest } from "@/lib/api";
import { toast } from "@/lib/toast";

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const section = navItems.find((item) => item.href === pathname)?.label ?? "Command Center";

  const handleLogout = async () => {
    await apiRequest("/api/auth/logout", { method: "POST" });
    toast({ title: "Session Closed", description: "Admin session ended." });
    router.push("/login");
  };

  return (
    <header className="flex items-center justify-between border-b border-zinc-900 px-4 py-4 sm:px-8">
      <div className="flex items-center gap-3">
        <button
          className="-m-2 rounded p-2 text-zinc-300 hover:text-zinc-100 lg:hidden"
          onClick={onMenuClick}
          aria-label="Open navigation"
        >
          <IconMenu className="h-6 w-6" />
        </button>
        {/* Breadcrumb context; the page's own <h1> carries the title. */}
        <p className="text-sm text-zinc-400">
          <span className="text-muted">Kage</span>
          <span className="mx-2 text-muted" aria-hidden="true">/</span>
          <span className="text-zinc-200">{section}</span>
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={handleLogout} className="h-9" aria-label="Log out">
        <IconLogout className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Log out</span>
      </Button>
    </header>
  );
}
