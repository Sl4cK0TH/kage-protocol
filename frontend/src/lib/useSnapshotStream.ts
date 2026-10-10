"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE, apiRequest } from "@/lib/api";
import { ContainerInfo, DockerStatsSummary } from "@/lib/types";

export interface Snapshot {
  containers: ContainerInfo[];
  stats: DockerStatsSummary | null;
  ts: number;
}

export type StreamStatus = "connecting" | "live" | "polling";

/**
 * Subscribe to the backend live snapshot stream (Server-Sent Events).
 *
 * Returns the latest snapshot plus a connection status. If EventSource fails
 * (proxy strips streaming, backend down, etc.) it transparently falls back to
 * interval polling so the dashboard keeps working either way.
 */
export function useSnapshotStream(pollMs = 5000): {
  snapshot: Snapshot | null;
  status: StreamStatus;
  /** Browser-clock epoch seconds of the last snapshot (immune to server clock skew). */
  receivedAt: number | null;
} {
  const [snapshot, setSnapshotState] = useState<Snapshot | null>(null);
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const setSnapshot = (next: Snapshot) => {
    setSnapshotState(next);
    setReceivedAt(Math.floor(Date.now() / 1000));
  };
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let source: EventSource | null = null;
    let cancelled = false;

    const startPolling = () => {
      if (pollRef.current || cancelled) return;
      setStatus("polling");
      const load = async () => {
        try {
          const [containers, stats] = await Promise.all([
            apiRequest<ContainerInfo[]>("/api/admin/docker/containers"),
            apiRequest<DockerStatsSummary>("/api/admin/docker/stats")
          ]);
          if (!cancelled) setSnapshot({ containers, stats, ts: Math.floor(Date.now() / 1000) });
        } catch {
          // apiRequest handles 401 redirects; ignore transient errors
        }
      };
      load();
      pollRef.current = setInterval(load, pollMs);
    };

    try {
      source = new EventSource(`${API_BASE}/api/admin/stream`, { withCredentials: true });

      source.addEventListener("snapshot", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as Snapshot;
          if (!cancelled) {
            setSnapshot(data);
            setStatus("live");
          }
        } catch {
          // ignore malformed frame
        }
      });

      source.onerror = () => {
        // EventSource auto-reconnects, but if it never opened, fall back to polling.
        if (source && source.readyState === EventSource.CLOSED) {
          source.close();
          startPolling();
        } else if (!snapshot) {
          // Give the stream a brief chance; if still nothing, poll.
          startPolling();
        }
      };
    } catch {
      startPolling();
    }

    return () => {
      cancelled = true;
      source?.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs]);

  return { snapshot, status, receivedAt };
}
