"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { apiRequest } from "@/lib/api";
import { toast } from "@/lib/toast";

export function Topbar() {
  const router = useRouter();

  const handleLogout = async () => {
    await apiRequest("/api/auth/logout", { method: "POST" });
    toast({ title: "Session Closed", description: "Admin session ended." });
    router.push("/login");
  };

  return (
    <header className="flex items-center justify-between border-b border-zinc-900 px-8 py-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Shadow Operations</p>
        <p className="text-lg font-display text-white">Live Control</p>
      </div>
      <Button variant="outline" size="sm" onClick={handleLogout}>
        Logout
      </Button>
    </header>
  );
}
