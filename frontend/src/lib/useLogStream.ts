"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";

export type LogStatus = "connecting" | "live" | "ended" | "error";

/**
 * Live-tail a container's logs via Server-Sent Events.
 *
 * Pass `null` to disable (e.g. when the detail drawer is closed) so the
 * EventSource is torn down and no connection is held open.
 */
export function useLogStream(containerId: string | null): { logs: string; status: LogStatus } {
  const [logs, setLogs] = useState<string>("");
  const [status, setStatus] = useState<LogStatus>("connecting");

  useEffect(() => {
    if (!containerId) {
      setLogs("");
      setStatus("connecting");
      return;
    }

    let cancelled = false;
    const source = new EventSource(
      `${API_BASE}/api/admin/docker/containers/${containerId}/logs/stream`,
      { withCredentials: true }
    );

    source.addEventListener("logs", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as { logs: string };
        if (!cancelled) {
          setLogs(data.logs || "");
          setStatus("live");
        }
      } catch {
        // ignore malformed frame
      }
    });

    source.addEventListener("gone", () => {
      if (!cancelled) setStatus("ended");
      source.close();
    });

    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED && !cancelled) {
        setStatus("error");
      }
    };

    return () => {
      cancelled = true;
      source.close();
    };
  }, [containerId]);

  return { logs, status };
}
