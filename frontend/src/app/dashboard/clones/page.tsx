"use client";

import { useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { ContainerInfo } from "@/lib/types";
import {
  Button,
  ConfirmDialog,
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
import { useSnapshotStream } from "@/lib/useSnapshotStream";
import { StreamStatusBadge } from "@/components/stream-status";
import { CloneDetailDrawer } from "@/components/clone-detail-drawer";
import { IconTerminal, IconTrash } from "@/components/icons";

export default function CloneManagerPage() {
  const { snapshot, status } = useSnapshotStream();
  const loading = snapshot === null;
  const items = snapshot?.containers ?? [];

  const [killTarget, setKillTarget] = useState<{ id: string; name: string } | null>(null);
  const [killing, setKilling] = useState(false);
  const [extending, setExtending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Derive the selected container + its live stats straight from the stream,
  // so the drawer updates in real time and closes if the clone disappears.
  const selected = useMemo(() => items.find((c) => c.id === selectedId) ?? null, [items, selectedId]);
  const selectedStat = useMemo(
    () => snapshot?.stats?.containers?.find((s) => s.id === selectedId) ?? null,
    [snapshot, selectedId]
  );

  const handleExtend = async (id: string, minutes: number) => {
    setExtending(true);
    try {
      const res = await apiRequest<{ time_remaining_seconds: number }>(
        `/api/admin/docker/containers/${id}/extend`,
        { method: "POST", body: { minutes } }
      );
      const mins = Math.floor(res.time_remaining_seconds / 60);
      toast({ title: "TTL Extended", description: `+${minutes}m — now ${mins}m remaining.`, variant: "success" });
    } catch (error) {
      toast({
        title: "Extend Failed",
        description: error instanceof Error ? error.message : "Unable to extend TTL.",
        variant: "destructive"
      });
    } finally {
      setExtending(false);
    }
  };

  const handleKill = async (id: string) => {
    setKilling(true);
    try {
      await apiRequest(`/api/admin/docker/containers/${id}`, { method: "DELETE" });
      toast({ title: "Clone Terminated", description: "Container destroyed.", variant: "destructive" });
      setKillTarget(null);
      if (selectedId === id) setSelectedId(null);
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-white">Active Clones</h2>
          <p className="text-sm text-zinc-500">Monitor every shadow clone and reap on demand.</p>
        </div>
        <StreamStatusBadge status={status} />
      </div>

      <div className="rounded-xl border border-zinc-900 bg-zinc-950/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Container</TableHead>
              <TableHead>Jutsu</TableHead>
              <TableHead>Ports</TableHead>
              <TableHead>Time Remaining</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6}>
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
                <TableCell colSpan={6} className="text-zinc-500">
                  No active clones.
                </TableCell>
              </TableRow>
            ) : null}
            {items.map((item) => (
              <CloneRow
                key={item.id}
                item={item}
                onOpen={() => setSelectedId(item.id)}
                onKill={(id, name) => setKillTarget({ id, name })}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <CloneDetailDrawer
        container={selected}
        stat={selectedStat}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onKill={(id, name) => setKillTarget({ id, name })}
        onExtend={handleExtend}
        killing={killing}
        extending={extending}
      />

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
  onOpen,
  onKill
}: {
  item: ContainerInfo;
  onOpen: () => void;
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
    <TableRow className="cursor-pointer transition hover:bg-zinc-900/40" onClick={onOpen}>
      <TableCell>
        <div>
          <p className="text-zinc-100">{item.name || item.id.slice(0, 12)}</p>
          <p className="text-xs text-zinc-500">{item.image?.join(", ")}</p>
        </div>
      </TableCell>
      <TableCell>
        {item.challenge_name ? (
          <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">
            {item.challenge_name}
          </span>
        ) : (
          <span className="text-xs text-zinc-600">—</span>
        )}
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
        {/* stopPropagation so action buttons don't also open the drawer */}
        <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onOpen}>
            <IconTerminal className="h-3.5 w-3.5" />
            Details
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="gap-1.5"
            onClick={() => onKill(item.id, item.name || item.id.slice(0, 12))}
          >
            <IconTrash className="h-3.5 w-3.5" />
            Kill
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
