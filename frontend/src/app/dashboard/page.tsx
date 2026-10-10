"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { AuditEntry } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton, Sparkline } from "@/components/ui";
import { useSnapshotStream } from "@/lib/useSnapshotStream";
import { StreamStatusBadge } from "@/components/stream-status";
import { PageHeader } from "@/components/page-header";
import { cn, formatBytes } from "@/lib/utils";
import { formatDuration, formatRelative, TTL_TEXT, ttlLevel } from "@/lib/format";
import { IconActivity, IconClock, IconClone, IconCpu, IconPulse } from "@/components/icons";
import { toast } from "@/lib/toast";

const HISTORY_LEN = 40; // rolling points kept for the sparklines

export default function DashboardPage() {
  const { snapshot, status, receivedAt } = useSnapshotStream();
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
  const running = containers.filter((item) => item.status === "running").length;
  const expiring = containers
    .filter((item) => item.time_remaining_seconds != null && item.time_remaining_seconds < 300)
    .sort((a, b) => (a.time_remaining_seconds ?? 0) - (b.time_remaining_seconds ?? 0));
  const soonest = expiring[0];
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
          title: "Activity unavailable",
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
      <PageHeader
        title="Command Overview"
        description="Real-time shadow clone telemetry."
        actions={<StreamStatusBadge status={status} updatedAt={receivedAt} />}
      />

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<IconClone className="h-4 w-4" />} label="Active shadow clones" value={loading ? null : activeClones}>
          <Sparkline data={clonesHist} color="#62f7c6" label={`Active clones trend, currently ${activeClones}`} />
        </StatCard>
        <StatCard icon={<IconPulse className="h-4 w-4" />} label="Running containers" value={loading ? null : running}>
          <Sparkline data={runningHist} color="#4cc9ff" label={`Running containers trend, currently ${running}`} />
        </StatCard>
        <StatCard
          icon={<IconClock className="h-4 w-4" />}
          label="Expiring within 5 min"
          value={loading ? null : expiring.length}
          accent={soonest ? TTL_TEXT[ttlLevel(soonest.time_remaining_seconds)] : undefined}
        >
          <div className="flex h-12 items-end">
            {soonest ? (
              <Link href="/dashboard/clones" className="text-sm text-zinc-300 underline-offset-4 hover:underline">
                Next: {soonest.challenge_name ?? soonest.name} in{" "}
                <span className="font-mono">{formatDuration(soonest.time_remaining_seconds ?? 0)}</span>
              </Link>
            ) : (
              <p className="text-sm text-muted">No clones about to expire</p>
            )}
          </div>
        </StatCard>
        <StatCard icon={<IconCpu className="h-4 w-4" />} label="CPU load" value={loading ? null : `${cpuPercent.toFixed(1)}%`}>
          <Sparkline data={cpuHist} color="#c4b5fd" max={100} label={`CPU load trend, currently ${cpuPercent.toFixed(1)}%`} />
        </StatCard>
      </section>

      <section className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <IconActivity className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              <CardTitle>Recent activity</CardTitle>
            </div>
            <CardDescription>Spawns, kills, extensions, and admin actions.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {eventsLoading ? (
              <div className="space-y-3 py-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : events.length ? (
              <ul>
                {events.map((event) => (
                  <ActivityRow key={event.id} event={event} />
                ))}
              </ul>
            ) : (
              <p className="py-2 text-muted">No activity yet — spawned and killed clones will show up here.</p>
            )}
            <Link href="/dashboard/audit" className="mt-3 inline-block text-sm text-emerald-300 underline-offset-4 hover:underline">
              View full audit log
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Memory in use</CardDescription>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="font-display text-3xl font-semibold tabular-nums text-white">
                {formatBytes(stats?.total_memory_usage || 0)}
              </p>
            )}
            <CardDescription>
              of {loading ? "—" : formatBytes(stats?.total_memory_limit || 0)} allocated
              {loading ? null : ` (${memoryPercent.toFixed(0)}%)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Sparkline data={memHist} color="#4cc9ff" max={100} label={`Memory use trend, currently ${memoryPercent.toFixed(0)}%`} />
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
  value: React.ReactNode | null;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-sm text-zinc-400">{label}</h2>
          <span className="text-muted" aria-hidden="true">
            {icon}
          </span>
        </div>
        {value === null ? (
          <Skeleton className="mt-2 h-9 w-16" />
        ) : (
          <p className={cn("mt-1 font-display text-4xl font-semibold tabular-nums text-white", accent)}>{value}</p>
        )}
      </CardHeader>
      <CardContent className="pt-3">{value === null ? <Skeleton className="h-12 w-full" /> : children}</CardContent>
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
  // Fall back to the target, minus placeholder targets ("global" settings,
  // "admin" for login/logout), with full container IDs shortened Docker-style.
  const target = ["global", "admin"].includes(event.target) ? null : event.target;
  const detail = challengeName ?? (target && /^[0-9a-f]{64}$/.test(target) ? target.slice(0, 12) : target);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-900/60 py-2.5 last:border-0">
      <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
      <span className="text-zinc-200">{meta.label}</span>
      {detail ? <span className="min-w-0 truncate text-zinc-400">· {detail}</span> : null}
      <span className="ml-auto shrink-0 text-xs text-muted">
        {event.actor} · <time dateTime={new Date(event.created_at * 1000).toISOString()}>{formatRelative(event.created_at)}</time>
      </span>
    </li>
  );
}
