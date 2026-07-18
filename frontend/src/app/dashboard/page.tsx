"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { ContainerInfo, DockerStatsSummary } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Progress, Skeleton } from "@/components/ui";
import { toast } from "@/lib/toast";

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
      } catch (error) {
        toast({
          title: "Dashboard Error",
          description: error instanceof Error ? error.message : "Unable to load metrics.",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const activeClones = containers.length;
  const expiringSoon = containers.filter((item) => (item.time_remaining_seconds ?? 0) < 300).length;
  const running = containers.filter((item) => item.status === "running").length;
  const cpuPercent = stats ? Math.min(100, stats.total_cpu_percent) : 0;
  const memoryPercent = stats?.total_memory_limit
    ? Math.min(100, (stats.total_memory_usage / stats.total_memory_limit) * 100)
    : 0;

  return (
    <div className="space-y-8">
      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Active Shadow Clones</CardDescription>
            <CardTitle>{loading ? "--" : activeClones}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-2 w-full" /> : <Progress value={Math.min(100, activeClones * 10)} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Running Containers</CardDescription>
            <CardTitle>{loading ? "--" : running}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-2 w-full" /> : <Progress value={Math.min(100, running * 10)} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Expiring in 5m</CardDescription>
            <CardTitle>{loading ? "--" : expiringSoon}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-2 w-full" /> : <Progress value={Math.min(100, expiringSoon * 10)} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>CPU / Memory Load</CardDescription>
            <CardTitle>{loading ? "--" : `${cpuPercent.toFixed(1)}%`}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <>
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-full" />
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>CPU</span>
                    <span>{cpuPercent.toFixed(1)}%</span>
                  </div>
                  <Progress value={cpuPercent} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>Memory</span>
                    <span>
                      {formatBytes(stats?.total_memory_usage || 0)} / {formatBytes(stats?.total_memory_limit || 0)}
                    </span>
                  </div>
                  <Progress value={memoryPercent} />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest shadow clone changes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-zinc-300">
          {loading ? (
            <>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
            </>
          ) : (
            <>
              {containers.slice(0, 6).map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <span>{item.name || item.id.slice(0, 12)}</span>
                  <span className="text-emerald-300">{item.status}</span>
                </div>
              ))}
              {!containers.length ? <p className="text-zinc-500">No shadow clones active yet.</p> : null}
            </>
          )}
        </CardContent>
      </Card>
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
