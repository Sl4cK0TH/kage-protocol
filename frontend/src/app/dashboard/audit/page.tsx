"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import {
  Card,
  CardContent,
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

interface AuditEntry {
  id: number;
  created_at: number;
  actor: string;
  action: string;
  target: string;
  meta: Record<string, unknown>;
}

const ACTION_COLORS: Record<string, string> = {
  login: "text-blue-400",
  logout: "text-zinc-400",
  create_jutsu: "text-emerald-400",
  update_jutsu: "text-amber-400",
  delete_jutsu: "text-red-400",
  spawn: "text-teal-400",
  admin_spawn: "text-teal-400",
  public_kill: "text-orange-400",
  kill_container: "text-red-400",
  update_settings: "text-amber-400"
};

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiRequest<AuditEntry[]>("/api/admin/audit?limit=100");
        setEntries(data);
      } catch {
        // handled by apiRequest (redirect on 401)
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-white">Audit Log</h2>
        <p className="text-sm text-zinc-500">
          Complete record of admin and spawn events.
        </p>
      </div>

      {/* Summary cards */}
      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total Events" value={entries.length} loading={loading} />
        <StatCard
          label="Logins"
          value={entries.filter((e) => e.action === "login").length}
          loading={loading}
        />
        <StatCard
          label="Spawns"
          value={entries.filter((e) => e.action === "spawn" || e.action === "admin_spawn").length}
          loading={loading}
        />
        <StatCard
          label="Kills"
          value={entries.filter((e) => e.action.includes("kill")).length}
          loading={loading}
        />
      </section>

      {/* Table */}
      <div className="rounded-xl border border-zinc-900 bg-zinc-950/70">
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
                  No audit events recorded yet.
                </TableCell>
              </TableRow>
            ) : null}
            {entries.map((entry) => (
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
                <TableCell className="text-xs text-zinc-500">
                  {(entry.meta?.ip as string) || "—"}
                </TableCell>
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

function StatCard({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle>{loading ? "—" : value}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-2 w-full" /> : null}
      </CardContent>
    </Card>
  );
}
