"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui";
import { IconDownload } from "@/components/icons";

type PullState = "idle" | "pulling" | "done" | "error";

interface Props {
  image: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

interface ProgressFrame {
  status?: string;
  progress?: string;
  id?: string;
}

/**
 * Streams `docker pull` progress for an image over SSE and renders it live.
 * Layers are keyed by id so their progress bars update in place rather than
 * flooding the log.
 */
export function PullImageDialog({ image, open, onOpenChange, onComplete }: Props) {
  const [state, setState] = useState<PullState>("idle");
  const [layers, setLayers] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [error, setError] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !image) return;

    setState("pulling");
    setLayers({});
    setOrder([]);
    setError("");

    const source = new EventSource(
      `${API_BASE}/api/admin/docker/images/pull/stream?image=${encodeURIComponent(image)}`,
      { withCredentials: true }
    );

    source.addEventListener("progress", (event) => {
      try {
        const frame = JSON.parse((event as MessageEvent).data) as ProgressFrame;
        const key = frame.id || frame.status || "log";
        const line = [frame.status, frame.progress].filter(Boolean).join(" ");
        setLayers((prev) => ({ ...prev, [key]: line }));
        setOrder((prev) => (prev.includes(key) ? prev : [...prev, key]));
      } catch {
        // ignore malformed frame
      }
    });

    source.addEventListener("done", () => {
      setState("done");
      source.close();
      onComplete?.();
    });

    source.addEventListener("error", (event) => {
      // Distinguish a server "error" event (has data) from a transport drop.
      const data = (event as MessageEvent).data;
      if (data) {
        try {
          setError(JSON.parse(data).detail || "Pull failed");
        } catch {
          setError("Pull failed");
        }
      } else if (source.readyState === EventSource.CLOSED) {
        setError("Connection lost");
      }
      setState("error");
      source.close();
    });

    return () => source.close();
  }, [open, image, onComplete]);

  // Keep the newest layer in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [layers]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <IconDownload className="h-4 w-4 text-emerald-300" />
            <DialogTitle>Pull Image</DialogTitle>
          </div>
          <p className="font-mono text-xs text-zinc-500">{image}</p>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-zinc-900 bg-black p-3 font-mono text-xs"
        >
          {order.length ? (
            order.map((key) => (
              <div key={key} className="flex gap-2 text-green-400">
                {key.length === 12 ? <span className="text-zinc-600">{key}</span> : null}
                <span className="truncate">{layers[key]}</span>
              </div>
            ))
          ) : (
            <p className="text-zinc-600">Starting pull…</p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <StatusLine state={state} error={error} />
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {state === "pulling" ? "Close (keeps pulling)" : "Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusLine({ state, error }: { state: PullState; error: string }) {
  if (state === "pulling")
    return (
      <span className="flex items-center gap-2 text-sm text-emerald-300">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        Pulling…
      </span>
    );
  if (state === "done") return <span className="text-sm text-emerald-400">✓ Pull complete</span>;
  if (state === "error") return <span className="text-sm text-red-400">✕ {error || "Pull failed"}</span>;
  return null;
}
