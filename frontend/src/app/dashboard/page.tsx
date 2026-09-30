"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import { AuditEntry } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton, Sparkline } from "@/components/ui";
import { useSnapshotStream } from "@/lib/useSnapshotStream";
import { StreamStatusBadge } from "@/components/stream-status";
import { formatBytes } from "@/lib/utils";
import {
  IconActivity,
  IconClock,
  IconClone,
  IconCpu,
  IconPulse
} from "@/components/icons";
import { toast } from "@/lib/toast";

const HISTORY_LEN = 40; // rolling points kept for the sparklines

export default function DashboardPage() {
  const { snapshot, status } = useSnapshotStream();
  const [events, setEvents] = useState<AuditEntry[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  // Client-side rolling history, accumulated from each live snapshot.
  const [clonesHist, setClonesHist] = useState<number[]>([]);
  const [runningHist, setRunningHist] = useState<number[]>([]);
  const [cpuHist, setCpuHist] = useState<number[]>([]);
  const [memHist, setMemHist] = useState<number[]>([]);
  const lastTs = useRef<number>(0);

  const loading = snapshot === null;
  const containers = snapshot?.containers ?? [];
  const stats = snapshot?.stats ?? null;

  const activeClones = containers.length;
  const expiringSoon = containers.filter((item) => (item.time_remaining_seconds ?? 0) < 300).length;
  const running = containers.filter((item) => item.status === "running").length;
  const cpuPercent = stats ? Math.min(100, stats.total_cpu_percent) : 0;
  const memoryPercent = stats?.total_memory_limit
    ? Math.min(100, (stats.total_memory_usage / stats.total_memory_limit) * 100)
    : 0;

  // Append to history whenever a fresh snapshot arrives.
  useEffect(() => {
    if (!snapshot || snapshot.ts === lastTs.current) return;
    lastTs.current = snapshot.ts;
    const push = (setter: React.Dispatch<React.SetStateAction<number[]>>, value: number) =>
      setter((prev) => [...prev, value].slice(-HISTORY_LEN));
    push(setClonesHist, activeClones);
    push(setRunningHist, running);
    push(setCpuHist, cpuPercent);
    push(setMemHist, memoryPercent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  // Activity feed comes from the audit log (not part of the container stream).
  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiRequest<AuditEntry[]>("/api/admin/audit?limit=8");
        setEvents(data);
      } catch (error) {
        toast({
          title: "Activity Error",
          description: error instanceof Error ? error.message : "Unable to load activity.",
          variant: "destructive"
        });
      } finally {
        setEventsLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl text-white">Command Overview</h2>
          <p className="text-sm text-zinc-500">Real-time shadow clone telemetry.</p>
        </div>
        <StreamStatusBadge status={status} />
      </div>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<IconClone className="h-4 w-4" />}
          label="Active Shadow Clones"
          value={loading ? "--" : activeClones}
        >
          {loading ? <Skeleton className="h-12 w-full" /> : <Sparkline data={clonesHist} color="#62f7c6" className="text-emerald-300" />}
        </StatCard>
        <StatCard
          icon={<IconPulse className="h-4 w-4" />}
          label="Running Containers"
          value={loading ? "--" : running}
        >
          {loading ? <Skeleton className="h-12 w-full" /> : <Sparkline data={runningHist} color="#4cc9ff" className="text-sky-300" />}
        </StatCard>
        <StatCard
          icon={<IconClock className="h-4 w-4" />}
          label="Expiring in 5m"
          value={loading ? "--" : expiringSoon}
          accent={expiringSoon > 0 ? "text-amber-300" : undefined}
        >
          {loading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <div className="flex h-12 items-end">
              <p className="text-xs text-zinc-500">
                {expiringSoon > 0 ? `${expiringSoon} clone(s) ending soon` : "No imminent expiries"}
              </p>
            </div>
          )}
        </StatCard>
        <StatCard
          icon={<IconCpu className="h-4 w-4" />}
          label="CPU Load"
          value={loading ? "--" : `${cpuPercent.toFixed(1)}%`}
        >
          {loading ? <Skeleton className="h-12 w-full" /> : <Sparkline data={cpuHist} color="#c4b5fd" max={100} className="text-violet-300" />}
        </StatCard>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <IconActivity className="h-4 w-4 text-emerald-300" />
              <CardTitle>Recent Activity</CardTitle>
            </div>
            <CardDescription>Live feed of spawns, kills, and admin actions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {eventsLoading ? (
              <div className="space-y-3 py-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : events.length ? (
              events.map((event) => <ActivityRow key={event.id} event={event} />)
            ) : (
              <p className="py-2 text-zinc-500">No activity recorded yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Memory Load</CardDescription>
            <CardTitle>
              {loading ? "--" : `${formatBytes(stats?.total_memory_usage || 0)}`}
            </CardTitle>
            <CardDescription>
              of {loading ? "--" : formatBytes(stats?.total_memory_limit || 0)} allocated
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <Sparkline data={memHist} color="#4cc9ff" max={100} className="text-sky-300" />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
  children
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardDescription>{label}</CardDescription>
          <span className="text-zinc-600">{icon}</span>
        </div>
        <CardTitle className={accent}>{value}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Human-readable metadata for each audit action. */
const ACTION_META: Record<string, { label: string; dot: string }> = {
  login: { label: "Admin login", dot: "bg-blue-400" },
  logout: { label: "Admin logout", dot: "bg-zinc-500" },
  create_jutsu: { label: "Created jutsu", dot: "bg-emerald-400" },
  update_jutsu: { label: "Updated jutsu", dot: "bg-amber-400" },
  delete_jutsu: { label: "Deleted jutsu", dot: "bg-red-400" },
  spawn: { label: "Spawned clone", dot: "bg-teal-400" },
  admin_spawn: { label: "Spawned clone", dot: "bg-teal-400" },
  extend_ttl: { label: "Extended clone TTL", dot: "bg-sky-400" },
  public_kill: { label: "Player stopped clone", dot: "bg-orange-400" },
  kill_container: { label: "Killed clone", dot: "bg-red-400" },
  reap: { label: "Reaper expired clone", dot: "bg-violet-400" },
  update_settings: { label: "Updated settings", dot: "bg-amber-400" }
};

function ActivityRow({ event }: { event: AuditEntry }) {
  const meta = ACTION_META[event.action] ?? { label: event.action, dot: "bg-zinc-500" };
  const challengeName = typeof event.meta?.challenge_name === "string" ? event.meta.challenge_name : null;
  const detail = challengeName ?? (event.target && event.target !== "global" ? event.target : null);

  return (
    <div className="flex items-center gap-3 border-b border-zinc-900/60 py-2 last:border-0">
      <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
      <span className="text-zinc-200">{meta.label}</span>
      {detail ? <span className="truncate text-zinc-500">· {detail}</span> : null}
      <span className="ml-auto shrink-0 text-xs text-zinc-600">
        {event.actor} · {formatRelative(event.created_at)}
      </span>
    </div>
  );
}

function formatRelative(epochSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - epochSeconds);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
