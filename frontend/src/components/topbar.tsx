"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { IconLogout, IconMenu } from "@/components/icons";
import { apiRequest } from "@/lib/api";
import { toast } from "@/lib/toast";

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter();

  const handleLogout = async () => {
    await apiRequest("/api/auth/logout", { method: "POST" });
    toast({ title: "Session Closed", description: "Admin session ended." });
    router.push("/login");
  };

  return (
    <header className="flex items-center justify-between border-b border-zinc-900 px-4 py-4 sm:px-8">
      <div className="flex items-center gap-3">
        <button
          className="text-zinc-400 hover:text-zinc-100 lg:hidden"
          onClick={onMenuClick}
          aria-label="Open navigation"
        >
          <IconMenu className="h-6 w-6" />
        </button>
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Shadow Operations</p>
          <p className="text-lg font-display text-white">Live Control</p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
        <IconLogout className="h-4 w-4" />
        <span className="hidden sm:inline">Logout</span>
      </Button>
    </header>
  );
}
