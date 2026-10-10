"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import { PageHeader } from "@/components/page-header";
import { CloneDetailDrawer } from "@/components/clone-detail-drawer";
import { IconClone, IconTerminal, IconTrash } from "@/components/icons";
import { formatDuration, statusTone, TTL_LABEL, TTL_TEXT, ttlLevel } from "@/lib/format";

export default function CloneManagerPage() {
  const { snapshot, status, receivedAt } = useSnapshotStream();
  const loading = snapshot === null;
  // Most urgent first, so expiring clones are never buried.
  const items = useMemo(
    () =>
      [...(snapshot?.containers ?? [])].sort(
        (a, b) => (a.time_remaining_seconds ?? Infinity) - (b.time_remaining_seconds ?? Infinity)
      ),
    [snapshot]
  );

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
      const res = await apiRequest<{ time_remaining_seconds: number }>(`/api/admin/docker/containers/${id}/extend`, {
        method: "POST",
        body: { minutes }
      });
      toast({
        title: "TTL extended",
        description: `+${minutes}m — ${formatDuration(res.time_remaining_seconds)} remaining.`,
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Extend failed",
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
      toast({ title: "Clone terminated", description: `${killTarget?.name ?? "Container"} was removed.` });
      setKillTarget(null);
      if (selectedId === id) setSelectedId(null);
    } catch (error) {
      toast({
        title: "Kill failed",
        description: error instanceof Error ? error.message : "Unable to kill container.",
        variant: "destructive"
      });
    } finally {
      setKilling(false);
    }
  };

  const requestKill = (item: ContainerInfo) => setKillTarget({ id: item.id, name: item.name || item.id.slice(0, 12) });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Active Clones"
        description="Every running shadow clone, most urgent first."
        actions={<StreamStatusBadge status={status} updatedAt={receivedAt} />}
      />

      {loading ? (
        <div className="space-y-3 rounded-xl border border-zinc-900 bg-zinc-950/70 p-5">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/3" />
        </div>
      ) : !items.length ? (
        <EmptyState />
      ) : (
        <>
          {/* Phones: stacked cards keep every action on screen. */}
          <ul className="space-y-3 md:hidden" aria-label="Active clones">
            {items.map((item) => (
              <CloneCard key={item.id} item={item} onOpen={() => setSelectedId(item.id)} onKill={() => requestKill(item)} />
            ))}
          </ul>

          {/* Tablet and up: the full table. */}
          <div className="hidden overflow-hidden rounded-xl border border-zinc-900 bg-zinc-950/70 md:block">
            <Table>
              <caption className="sr-only">Active clones, sorted by time remaining</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Container</TableHead>
                  <TableHead>Jutsu</TableHead>
                  <TableHead>Ports</TableHead>
                  <TableHead>Time remaining</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <CloneRow key={item.id} item={item} onOpen={() => setSelectedId(item.id)} onKill={() => requestKill(item)} />
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

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
        onOpenChange={(open) => {
          if (!open) setKillTarget(null);
        }}
        title="Kill this clone?"
        description={`"${killTarget?.name}" will be force-removed immediately. The player loses their instance.`}
        confirmLabel="Kill clone"
        variant="destructive"
        onConfirm={() => killTarget && handleKill(killTarget.id)}
        loading={killing}
      />
    </div>
  );
}

function hostPorts(item: ContainerInfo): string {
  return Array.from(
    new Set(Object.values(item.ports || {}).flatMap((mapping) => mapping?.map((entry) => entry.HostPort) || []))
  ).join(", ");
}

/** Countdown text with urgency color *and* a word, so meaning isn't color-only. */
function Ttl({ seconds }: { seconds: number | null | undefined }) {
  const remaining = useCountdown(seconds ?? 0);
  if (seconds === null || seconds === undefined) return <span className="text-muted">—</span>;
  const level = ttlLevel(remaining);
  return (
    <span className={`font-mono tabular-nums ${TTL_TEXT[level]}`}>
      {formatDuration(remaining)}
      {TTL_LABEL[level] ? <span className="ml-2 font-sans text-xs">{TTL_LABEL[level]}</span> : null}
    </span>
  );
}

function Status({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <span className="inline-flex items-center gap-2 text-zinc-300">
      <span className={`h-2 w-2 rounded-full ${tone.dot} ${tone.pulse ? "animate-pulse" : ""}`} aria-hidden="true" />
      {status}
    </span>
  );
}

function JutsuBadge({ name }: { name?: string | null }) {
  if (!name) return <span className="text-xs text-muted">—</span>;
  return (
    <span className="inline-flex max-w-[16rem] items-center truncate rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">
      {name}
    </span>
  );
}

function CloneRow({ item, onOpen, onKill }: { item: ContainerInfo; onOpen: () => void; onKill: () => void }) {
  return (
    // The row is a mouse shortcut; "Details" is the keyboard/screen-reader path.
    <TableRow className="cursor-pointer transition-colors hover:bg-zinc-900/50" onClick={onOpen}>
      <TableCell>
        <p className="text-zinc-100">{item.name || item.id.slice(0, 12)}</p>
        <p className="font-mono text-xs text-muted">{item.image?.join(", ")}</p>
      </TableCell>
      <TableCell>
        <JutsuBadge name={item.challenge_name} />
      </TableCell>
      <TableCell className="font-mono text-zinc-300">{hostPorts(item) || "—"}</TableCell>
      <TableCell>
        <Ttl seconds={item.time_remaining_seconds} />
      </TableCell>
      <TableCell>
        <Status status={item.status} />
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="outline" onClick={onOpen} aria-label={`Details for ${item.name}`}>
            <IconTerminal className="h-3.5 w-3.5" aria-hidden="true" />
            Details
          </Button>
          <Button size="sm" variant="danger" onClick={onKill} aria-label={`Kill ${item.name}`}>
            <IconTrash className="h-3.5 w-3.5" aria-hidden="true" />
            Kill
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function CloneCard({ item, onOpen, onKill }: { item: ContainerInfo; onOpen: () => void; onKill: () => void }) {
  return (
    <li className="rounded-xl border border-zinc-900 bg-zinc-950/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-zinc-100">{item.name || item.id.slice(0, 12)}</p>
          <div className="mt-1">
            <JutsuBadge name={item.challenge_name} />
          </div>
        </div>
        <Status status={item.status} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Time remaining</dt>
          <dd>
            <Ttl seconds={item.time_remaining_seconds} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Ports</dt>
          <dd className="font-mono text-zinc-300">{hostPorts(item) || "—"}</dd>
        </div>
      </dl>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11" onClick={onOpen}>
          <IconTerminal className="h-4 w-4" aria-hidden="true" />
          Details
        </Button>
        <Button variant="danger" className="h-11" onClick={onKill}>
          <IconTrash className="h-4 w-4" aria-hidden="true" />
          Kill
        </Button>
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-zinc-800 px-6 py-14 text-center">
      <IconClone className="h-8 w-8 text-muted" aria-hidden="true" />
      <p className="mt-4 text-zinc-200">No active clones</p>
      <p className="mt-1 max-w-sm text-sm text-zinc-400">
        Clones appear here when a player starts a challenge from your CTF platform, or when you spawn one from the Jutsu
        Library.
      </p>
      <Link
        href="/dashboard/jutsus"
        className="mt-5 inline-flex h-10 items-center rounded-md border border-zinc-700 px-4 text-sm text-zinc-200 hover:border-emerald-400"
      >
        Open Jutsu Library
      </Link>
    </div>
  );
}
