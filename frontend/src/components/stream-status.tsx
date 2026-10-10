"use client";

import { useEffect, useState } from "react";
import type { StreamStatus } from "@/lib/useSnapshotStream";

// Snapshots arrive every 3s (5s when polling); beyond this the data is stale.
const STALE_AFTER_SECONDS = 12;

/**
 * Connection pill for live telemetry. Shows how fresh the data is and flips
 * to "Stale" when updates stop, so the UI never claims "Live" over old data.
 * Only the state word is announced (role="status"); the ticking age is
 * aria-hidden so screen readers aren't interrupted every second.
 */
export function StreamStatusBadge({ status, updatedAt }: { status: StreamStatus; updatedAt?: number | null }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const age = updatedAt ? Math.max(0, now - updatedAt) : null;
  const stale = age !== null && age > STALE_AFTER_SECONDS;
  const state = stale ? "stale" : status;

  const map = {
    connecting: { text: "Connecting", dot: "bg-zinc-500", cls: "border-zinc-700 text-zinc-300" },
    live: { text: "Live", dot: "bg-emerald-400 animate-pulse", cls: "border-emerald-500/40 text-emerald-300" },
    polling: { text: "Polling", dot: "bg-amber-400", cls: "border-amber-500/40 text-amber-300" },
    stale: { text: "Stale", dot: "bg-red-400", cls: "border-red-500/40 text-red-300" }
  } as const;
  const s = map[state];

  const title =
    state === "stale"
      ? "No updates recently — the backend may be unreachable"
      : state === "polling"
        ? "Live stream unavailable — refreshing on an interval"
        : "Receiving live updates";

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${s.cls}`} title={title}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden="true" />
      <span role="status" aria-atomic="true">
        {s.text}
      </span>
      {age !== null ? (
        <span className="font-mono text-muted" aria-hidden="true">
          · {age < 60 ? `${age}s` : `${Math.floor(age / 60)}m`} ago
        </span>
      ) : null}
    </span>
  );
}
