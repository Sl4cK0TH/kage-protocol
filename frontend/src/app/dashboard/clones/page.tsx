"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { ContainerInfo } from "@/lib/types";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui";
import { toast } from "@/lib/toast";
import { useCountdown } from "@/lib/useCountdown";

export default function CloneManagerPage() {
  const [items, setItems] = useState<ContainerInfo[]>([]);
  const [selectedLogs, setSelectedLogs] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [killTarget, setKillTarget] = useState<{ id: string; name: string } | null>(null);
  const [killing, setKilling] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<ContainerInfo[]>("/api/admin/docker/containers");
      setItems(data);
    } catch (error) {
      toast({
        title: "Load Failed",
        description: error instanceof Error ? error.message : "Unable to fetch clones.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLogs = async (id: string) => {
    try {
      const data = await apiRequest<{ logs: string }>(`/api/admin/docker/containers/${id}/logs`);
      setSelectedLogs(data.logs);
      setLogsOpen(true);
    } catch (error) {
      toast({
        title: "Logs Unavailable",
        description: error instanceof Error ? error.message : "Unable to fetch logs.",
        variant: "destructive"
      });
    }
  };

  const handleKill = async (id: string) => {
    setKilling(true);
    try {
      await apiRequest(`/api/admin/docker/containers/${id}`, { method: "DELETE" });
      toast({ title: "Clone Terminated", description: "Container destroyed.", variant: "destructive" });
      setKillTarget(null);
      await load();
    } catch (error) {
      toast({
        title: "Kill Failed",
        description: error instanceof Error ? error.message : "Unable to kill container.",
        variant: "destructive"
      });
    } finally {
      setKilling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-white">Active Clones</h2>
        <p className="text-sm text-zinc-500">Monitor every shadow clone and reap on demand.</p>
      </div>

      <div className="rounded-xl border border-zinc-900 bg-zinc-950/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Container</TableHead>
              <TableHead>Ports</TableHead>
              <TableHead>Time Remaining</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                </TableCell>
              </TableRow>
            ) : null}
            {!loading && !items.length ? (
              <TableRow>
                <TableCell colSpan={5} className="text-zinc-500">
                  No active clones.
                </TableCell>
              </TableRow>
            ) : null}
            {items.map((item) => (
              <CloneRow key={item.id} item={item} onLogs={handleLogs} onKill={(id, name) => setKillTarget({ id, name })} />
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={logsOpen}
        onOpenChange={(open) => {
          setLogsOpen(open);
          if (!open) setSelectedLogs(null);
        }}
      >
        <DialogContent className="bg-black text-green-400">
          <DialogHeader>
            <DialogTitle className="text-green-300">Container Logs</DialogTitle>
          </DialogHeader>
          <div className="max-h-[420px] overflow-y-auto rounded-lg border border-green-500/20 bg-black p-4 font-mono text-xs text-green-400 flex flex-col-reverse">
            <pre className="whitespace-pre-wrap">{selectedLogs || "No logs yet."}</pre>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={killTarget !== null}
        onOpenChange={(open) => { if (!open) setKillTarget(null); }}
        title="Kill Container"
        description={`Are you sure you want to kill "${killTarget?.name || killTarget?.id?.slice(0, 12)}"? The container will be force-removed.`}
        confirmLabel="Kill"
        variant="destructive"
        onConfirm={() => killTarget && handleKill(killTarget.id)}
        loading={killing}
      />
    </div>
  );
}

function CloneRow({
  item,
  onLogs,
  onKill
}: {
  item: ContainerInfo;
  onLogs: (id: string) => void;
  onKill: (id: string, name: string) => void;
}) {
  const remainingSeconds = useCountdown(item.time_remaining_seconds ?? 0);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const ports = Array.from(
    new Set(
      Object.values(item.ports || {})
        .flatMap((mapping) => mapping?.map((entry) => entry.HostPort) || [])
    )
  ).join(", ");

  return (
    <TableRow>
      <TableCell>
        <div>
          <p className="text-zinc-100">{item.name || item.id.slice(0, 12)}</p>
          <p className="text-xs text-zinc-500">{item.image?.join(", ")}</p>
        </div>
      </TableCell>
      <TableCell className="text-zinc-300">{ports || "-"}</TableCell>
      <TableCell className="text-emerald-300">
        {item.time_remaining_seconds !== null && item.time_remaining_seconds !== undefined
          ? `${minutes}m ${seconds.toString().padStart(2, "0")}s`
          : "-"}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 text-zinc-300">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          {item.status}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onLogs(item.id)}>
            View Logs
          </Button>
          <Button size="sm" variant="destructive" onClick={() => onKill(item.id, item.name || item.id.slice(0, 12))}>
            Kill
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
