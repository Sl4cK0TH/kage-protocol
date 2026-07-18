import type React from "react";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="ml-64 flex min-h-screen flex-col">
        <Topbar />
        <main className="flex-1 space-y-8 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
