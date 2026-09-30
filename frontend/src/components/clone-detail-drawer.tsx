"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import { ContainerInfo, ContainerStat } from "@/lib/types";
import { useLogStream } from "@/lib/useLogStream";
import { useCountdown } from "@/lib/useCountdown";
import { copyToClipboard, formatBytes } from "@/lib/utils";
import { Button, Drawer, DrawerBody, DrawerFooter, DrawerHeader, Progress } from "@/components/ui";
import { IconClock, IconPulse, IconTerminal, IconTrash } from "@/components/icons";
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
  killing?: boolean;
}

export function CloneDetailDrawer({ container, stat, open, onOpenChange, onKill, killing }: Props) {
  // Only stream logs while the drawer is open for a container.
  const { logs, status: logStatus } = useLogStream(open && container ? container.id : null);
  const remaining = useCountdown(container?.time_remaining_seconds ?? 0);

  const hostPorts = useMemo(() => {
    if (!container) return [] as { internal: string; host: string }[];
    const out: { internal: string; host: string }[] = [];
    for (const [internal, mappings] of Object.entries(container.ports || {})) {
      for (const m of mappings || []) {
        if (m?.HostPort) out.push({ internal, host: m.HostPort });
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
    <Drawer open={open} onOpenChange={onOpenChange}>
      {container ? (
        <>
          <DrawerHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate font-display text-xl text-white">
                  {container.name || container.id.slice(0, 12)}
                </p>
                <p className="truncate text-xs text-zinc-500">{container.image?.join(", ") || container.id}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
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
                label="TTL"
                value={
                  container.time_remaining_seconds != null
                    ? `${Math.floor(remaining / 60)}m ${(remaining % 60).toString().padStart(2, "0")}s`
                    : "—"
                }
                accent={remaining < 300 && container.time_remaining_seconds != null ? "text-amber-300" : undefined}
              />
              <Metric icon={<IconPulse className="h-4 w-4" />} label="CPU" value={stat ? `${cpuPercent.toFixed(1)}%` : "—"} />
              <Metric
                icon={<IconPulse className="h-4 w-4" />}
                label="Memory"
                value={stat ? formatBytes(stat.memory_usage) : "—"}
              />
            </div>

            {stat ? (
              <div className="space-y-3">
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
                      {formatBytes(stat.memory_usage)} / {formatBytes(stat.memory_limit)}
                    </span>
                  </div>
                  <Progress value={memPercent} />
                </div>
              </div>
            ) : null}

            {/* Ports */}
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Port Mappings</p>
              {hostPorts.length ? (
                <div className="space-y-2">
                  {hostPorts.map(({ internal, host }) => (
                    <div
                      key={`${internal}-${host}`}
                      className="flex items-center justify-between rounded-md border border-zinc-900 bg-zinc-900/40 px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-zinc-300">
                        {internal} <span className="text-zinc-600">→</span> {CHALLENGE_HOST}:{host}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => copy(`${CHALLENGE_HOST}:${host}`, "Address")}
                      >
                        Copy
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-600">No published ports.</p>
              )}
            </div>

            {/* Live logs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
                  <IconTerminal className="h-3.5 w-3.5" />
                  Live Logs
                </p>
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
                variant="destructive"
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
  accent
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-900 bg-zinc-900/40 px-3 py-3">
      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
        {icon}
        {label}
      </div>
      <p className={`mt-1 font-display text-lg ${accent ?? "text-zinc-100"}`}>{value}</p>
    </div>
  );
}

function LogBadge({ status }: { status: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    connecting: { text: "connecting", cls: "text-zinc-500" },
    live: { text: "● live", cls: "text-emerald-400" },
    ended: { text: "ended", cls: "text-zinc-500" },
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
