"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import { ContainerInfo, ContainerStat } from "@/lib/types";
import { useLogStream } from "@/lib/useLogStream";
import { useCountdown } from "@/lib/useCountdown";
import { copyToClipboard, formatBytes } from "@/lib/utils";
import { Button, Drawer, DrawerBody, DrawerFooter, DrawerHeader, Progress } from "@/components/ui";
import { IconClock, IconCpu, IconPulse, IconTerminal, IconTrash } from "@/components/icons";
import { formatDuration, statusTone, TTL_LABEL, TTL_TEXT, ttlLevel } from "@/lib/format";
import { toast } from "@/lib/toast";

// Host used when building copyable connection strings.
const CHALLENGE_HOST = (() => {
  try {
    return new URL(API_BASE).hostname || "localhost";
  } catch {
    return "localhost";
  }
})();

interface Props {
  container: ContainerInfo | null;
  stat: ContainerStat | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKill: (id: string, name: string) => void;
  onExtend: (id: string, minutes: number) => void;
  killing?: boolean;
  extending?: boolean;
}

export function CloneDetailDrawer({
  container,
  stat,
  open,
  onOpenChange,
  onKill,
  onExtend,
  killing,
  extending
}: Props) {
  // Only stream logs while the drawer is open for a container.
  const { logs, status: logStatus } = useLogStream(open && container ? container.id : null);
  const remaining = useCountdown(container?.time_remaining_seconds ?? 0);

  const hostPorts = useMemo(() => {
    if (!container) return [] as { internal: string; host: string }[];
    // Docker lists each published port once per address family (0.0.0.0 and
    // ::), so collapse bindings that share an internal → host port pair.
    const seen = new Set<string>();
    const out: { internal: string; host: string }[] = [];
    for (const [internal, mappings] of Object.entries(container.ports || {})) {
      for (const m of mappings || []) {
        const key = `${internal}-${m?.HostPort}`;
        if (m?.HostPort && !seen.has(key)) {
          seen.add(key);
          out.push({ internal, host: m.HostPort });
        }
      }
    }
    return out;
  }, [container]);

  const memPercent = stat?.memory_limit ? Math.min(100, (stat.memory_usage / stat.memory_limit) * 100) : 0;
  const cpuPercent = stat ? Math.min(100, stat.cpu_percent) : 0;

  const copy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    toast({
      title: ok ? "Copied" : "Copy failed",
      description: ok ? `${label} copied to clipboard.` : "Clipboard unavailable.",
      variant: ok ? "success" : "destructive"
    });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} label={container ? `Clone ${container.name}` : "Clone details"}>
      {container ? (
        <>
          <DrawerHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {/* Initial focus lands here (not on "+15m"), so opening the drawer
                    announces the clone and a stray Enter can't trigger an action. */}
                <h2 tabIndex={-1} data-autofocus className="truncate font-display text-xl text-white focus:outline-none">
                  {container.name || container.id.slice(0, 12)}
                </h2>
                <p className="truncate font-mono text-xs text-muted">{container.image?.join(", ") || container.id}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <span
                  className={`h-2 w-2 rounded-full ${statusTone(container.status).dot} ${statusTone(container.status).pulse ? "animate-pulse" : ""}`}
                  aria-hidden="true"
                />
                {container.status}
              </div>
            </div>
            {container.challenge_name ? (
              <span className="mt-3 inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">
                {container.challenge_name}
              </span>
            ) : null}
          </DrawerHeader>

          <DrawerBody>
            {/* Countdown + live stats */}
            <div className="grid grid-cols-3 gap-3">
              <Metric
                icon={<IconClock className="h-4 w-4" />}
                label="Time left"
                value={
                  container.time_remaining_seconds != null
                    ? formatDuration(remaining)
                    : "—"
                }
                accent={container.time_remaining_seconds != null ? TTL_TEXT[ttlLevel(remaining)] : undefined}
                note={container.time_remaining_seconds != null ? TTL_LABEL[ttlLevel(remaining)] : null}
              />
              <Metric icon={<IconCpu className="h-4 w-4" />} label="CPU" value={stat ? `${cpuPercent.toFixed(1)}%` : "—"} />
              <Metric
                icon={<IconPulse className="h-4 w-4" />}
                label="Memory"
                value={stat ? formatBytes(stat.memory_usage) : "—"}
              />
            </div>

            {/* Extend TTL */}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-900 bg-zinc-900/40 px-3 py-2">
              <span id="extend-label" className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-400">Extend time</span>
              <div className="flex gap-2" role="group" aria-labelledby="extend-label">
                {[15, 30, 60].map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant="outline"
                    className="h-8 px-3"
                    disabled={extending}
                    onClick={() => onExtend(container.id, m)}
                    aria-label={`Extend by ${m} minutes`}
                  >
                    +{m}m
                  </Button>
                ))}
              </div>
            </div>

            {stat ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>CPU</span>
                    <span>{cpuPercent.toFixed(1)}%</span>
                  </div>
                  <Progress value={cpuPercent} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>Memory</span>
                    <span>
                      {formatBytes(stat.memory_usage)} / {formatBytes(stat.memory_limit)}
                    </span>
                  </div>
                  <Progress value={memPercent} />
                </div>
              </div>
            ) : null}

            {/* Ports */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-400">Port mappings</h3>
              {hostPorts.length ? (
                <div className="space-y-2">
                  {hostPorts.map(({ internal, host }) => (
                    <div
                      key={`${internal}-${host}`}
                      className="flex items-center justify-between rounded-md border border-zinc-900 bg-zinc-900/40 px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-zinc-300">
                        {internal} <span className="text-muted" aria-hidden="true">→</span> {CHALLENGE_HOST}:{host}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-3"
                        onClick={() => copy(`${CHALLENGE_HOST}:${host}`, "Address")}
                      >
                        Copy
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">No published ports.</p>
              )}
            </div>

            {/* Live logs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-zinc-400">
                  <IconTerminal className="h-3.5 w-3.5" />
                  Live logs
                </h3>
                <LogBadge status={logStatus} />
              </div>
              <LogViewer logs={logs} />
            </div>
          </DrawerBody>

          <DrawerFooter>
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                variant="danger"
                className="gap-1.5"
                disabled={killing}
                onClick={() => onKill(container.id, container.name || container.id.slice(0, 12))}
              >
                <IconTrash className="h-4 w-4" />
                {killing ? "Killing…" : "Kill Clone"}
              </Button>
            </div>
          </DrawerFooter>
        </>
      ) : null}
    </Drawer>
  );
}

function Metric({
  icon,
  label,
  value,
  accent,
  note
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
  /** Text companion to an accent color, so urgency isn't conveyed by color alone. */
  note?: string | null;
}) {
  return (
    <div className="rounded-lg border border-zinc-900 bg-zinc-900/40 px-3 py-3">
      <div className="flex items-center gap-1.5 text-xs text-zinc-400">
        <span aria-hidden="true">{icon}</span>
        {label}
      </div>
      <p className={`mt-1 font-mono text-lg tabular-nums ${accent ?? "text-zinc-100"}`}>{value}</p>
      {note ? <p className={`text-xs ${accent ?? "text-zinc-400"}`}>{note}</p> : null}
    </div>
  );
}

function LogBadge({ status }: { status: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    connecting: { text: "connecting", cls: "text-muted" },
    live: { text: "● live", cls: "text-emerald-400" },
    ended: { text: "ended", cls: "text-muted" },
    error: { text: "disconnected", cls: "text-red-400" }
  };
  const s = map[status] ?? map.connecting;
  return <span className={`text-xs ${s.cls}`}>{s.text}</span>;
}

function LogViewer({ logs }: { logs: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  // Auto-scroll to the bottom on new logs unless the user scrolled up.
  useEffect(() => {
    const el = ref.current;
    if (el && pinned) el.scrollTop = el.scrollHeight;
  }, [logs, pinned]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className="h-64 overflow-y-auto rounded-lg border border-green-500/20 bg-black p-3 font-mono text-xs text-green-400"
    >
      <pre className="whitespace-pre-wrap break-words">{logs || "Waiting for output…"}</pre>
    </div>
  );
}
