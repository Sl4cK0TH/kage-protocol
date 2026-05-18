"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { ContainerInfo, DockerStatsSummary } from "@/lib/types";
import { Panel, StatCard } from "@/components/ui";

export default function DashboardPage() {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [stats, setStats] = useState<DockerStatsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [containersData, statsData] = await Promise.all([
          apiRequest<ContainerInfo[]>("/api/admin/docker/containers"),
          apiRequest<DockerStatsSummary>("/api/admin/docker/stats")
        ]);
        setContainers(containersData);
        setStats(statsData);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const activeClones = containers.length;
  const expiringSoon = containers.filter((item) => (item.time_remaining_seconds ?? 0) < 300).length;
  const running = containers.filter((item) => item.status === "running").length;
  const cpuDisplay = stats ? `${stats.total_cpu_percent.toFixed(1)}%` : "...";
  const memoryDisplay = stats
    ? `${formatBytes(stats.total_memory_usage)} / ${formatBytes(stats.total_memory_limit)}`
    : "...";

  return (
    <div className="space-y-8">
      <section className="grid gap-6 md:grid-cols-4">
        <StatCard label="Active Shadow Clones" value={loading ? "..." : String(activeClones)} />
        <StatCard label="Running Containers" value={loading ? "..." : String(running)} />
        <StatCard label="Expiring in 5m" value={loading ? "..." : String(expiringSoon)} />
        <StatCard label="CPU / Memory" value={loading ? "..." : `${cpuDisplay} | ${memoryDisplay}`} />
      </section>

      <Panel title="Recent Activity">
        <div className="space-y-3 text-sm text-slate-300">
          {containers.slice(0, 6).map((item) => (
            <div key={item.id} className="flex items-center justify-between">
              <span>{item.name || item.id.slice(0, 12)}</span>
              <span className="text-neon">{item.status}</span>
            </div>
          ))}
          {!containers.length && !loading ? (
            <p className="text-slate-500">No shadow clones active yet.</p>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}
