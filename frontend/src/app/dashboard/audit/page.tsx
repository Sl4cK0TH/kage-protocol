"use client";

import { useEffect, useState } from "react";
import { apiRequest, apiRequestWithHeaders } from "@/lib/api";
import { AuditEntry } from "@/lib/types";
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui";
import { toast } from "@/lib/toast";

const PAGE_SIZE = 50;

const ACTION_COLORS: Record<string, string> = {
  login: "text-blue-400",
  logout: "text-zinc-400",
  create_jutsu: "text-emerald-400",
  update_jutsu: "text-amber-400",
  delete_jutsu: "text-red-400",
  spawn: "text-teal-400",
  admin_spawn: "text-teal-400",
  extend_ttl: "text-sky-400",
  public_kill: "text-orange-400",
  kill_container: "text-red-400",
  reap: "text-violet-400",
  update_settings: "text-amber-400"
};

interface AuditSummary {
  total: number;
  by_action: Record<string, number>;
}

function formatTimestamp(epoch: number): string {
  const d = new Date(epoch * 1000);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function formatMeta(meta: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(meta)) {
    if (key === "ip") continue; // shown in its own column
    if (typeof value === "string" && value.length > 20) {
      parts.push(`${key}: ${value.slice(0, 16)}…`);
    } else {
      parts.push(`${key}: ${String(value)}`);
    }
  }
  return parts.join(", ") || "—";
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [page, setPage] = useState(0);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);

  // Whole-log counts for the summary cards (not just the visible page).
  useEffect(() => {
    apiRequest<AuditSummary>("/api/admin/audit/summary")
      .then(setSummary)
      .catch(() => undefined); // 401 redirect handled by apiRequest
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
        if (action) params.set("action", action);
        const { data, headers } = await apiRequestWithHeaders<AuditEntry[]>(`/api/admin/audit?${params}`);
        if (cancelled) return;
        setEntries(data);
        setTotal(Number(headers.get("X-Total-Count") ?? data.length));
      } catch (error) {
        if (!cancelled) {
          toast({
            title: "Audit Log Unavailable",
            description: error instanceof Error ? error.message : "Unable to load audit events.",
            variant: "destructive"
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [page, action]);

  const count = (...actions: string[]) => actions.reduce((sum, a) => sum + (summary?.by_action[a] ?? 0), 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstShown = total ? page * PAGE_SIZE + 1 : 0;
  const lastShown = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-white">Audit Log</h2>
        <p className="text-sm text-zinc-500">Complete record of admin, spawn, and Reaper events.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <StatCard label="Total Events" value={summary?.total} />
        <StatCard label="Spawns" value={summary && count("spawn", "admin_spawn")} />
        <StatCard label="Kills" value={summary && count("kill_container", "public_kill")} />
        <StatCard label="Reaped" value={summary && count("reap")} />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
          <span>Action</span>
          <select
            className="rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm normal-case tracking-normal text-zinc-100"
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(0);
            }}
          >
            <option value="">All actions</option>
            {Object.keys(ACTION_COLORS).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>
            {firstShown}–{lastShown} of {total}
          </span>
          <Button size="sm" variant="outline" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>
            Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page + 1 >= pageCount || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-900 bg-zinc-950/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="space-y-2 py-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                </TableCell>
              </TableRow>
            ) : null}
            {!loading && !entries.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-zinc-500">
                  {action ? `No "${action}" events recorded.` : "No audit events recorded yet."}
                </TableCell>
              </TableRow>
            ) : null}
            {!loading &&
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-xs text-zinc-400">
                    {formatTimestamp(entry.created_at)}
                  </TableCell>
                  <TableCell className="text-zinc-200">{entry.actor}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                        ACTION_COLORS[entry.action] || "text-zinc-300"
                      } bg-zinc-900`}
                    >
                      {entry.action}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate font-mono text-xs text-zinc-400">
                    {entry.target}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">{(entry.meta?.ip as string) || "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-zinc-500">
                    {formatMeta(entry.meta)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        {value === null || value === undefined ? <Skeleton className="h-7 w-16" /> : <CardTitle>{value}</CardTitle>}
      </CardHeader>
    </Card>
  );
}
