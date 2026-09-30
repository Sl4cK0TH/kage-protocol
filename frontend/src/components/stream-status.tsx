"use client";

import type { StreamStatus } from "@/lib/useSnapshotStream";

/**
 * Small pill showing whether the dashboard is receiving live Server-Sent
 * Events or has fallen back to interval polling.
 */
export function StreamStatusBadge({ status }: { status: StreamStatus }) {
  const map: Record<StreamStatus, { text: string; dot: string; cls: string }> = {
    connecting: { text: "Connecting", dot: "bg-zinc-500", cls: "border-zinc-800 text-zinc-400" },
    live: { text: "Live", dot: "bg-emerald-400 animate-pulse", cls: "border-emerald-500/30 text-emerald-300" },
    polling: { text: "Polling", dot: "bg-amber-400", cls: "border-amber-500/30 text-amber-300" }
  };
  const s = map[status];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${s.cls}`}
      title={status === "polling" ? "Live stream unavailable — refreshing on an interval" : "Receiving live updates"}
    >
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.text}
    </span>
  );
}
