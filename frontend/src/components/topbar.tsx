"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { apiRequest } from "@/lib/api";

export function Topbar() {
  const router = useRouter();

  const handleLogout = async () => {
    await apiRequest("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <header className="flex items-center justify-between border-b border-slate-800/70 px-8 py-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Shadow Operations</p>
        <p className="text-lg font-display text-white">Live Control</p>
      </div>
      <Button variant="ghost" onClick={handleLogout}>
        Logout
      </Button>
    </header>
  );
}
