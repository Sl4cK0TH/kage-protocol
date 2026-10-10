"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ToastMessage, subscribeToToasts } from "@/lib/toast";

// Errors stay up longer: they usually need reading, and may need acting on.
const DURATION_MS = { default: 4000, success: 4000, destructive: 8000 };

/**
 * Toast stack inside one persistent polite live region, so each new toast is
 * announced exactly once (per-item roles nested in a live region can double-
 * announce, and freshly inserted live elements are announced unreliably).
 * Each toast can be dismissed; the stack spans the width on phones.
 */
export function Toaster() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const dismiss = useCallback((id: string) => setToasts((current) => current.filter((t) => t.id !== id)), []);

  useEffect(() => {
    return subscribeToToasts((message) => {
      setToasts((current) => [...current.slice(-3), message]);
      setTimeout(() => dismiss(message.id), DURATION_MS[message.variant ?? "default"]);
    });
  }, [dismiss]);

  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-4 top-4 z-[60] flex flex-col items-end gap-3 sm:inset-x-auto sm:right-6 sm:top-6"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-xl backdrop-blur sm:w-80",
            toast.variant === "success" && "border-emerald-500/50 bg-zinc-950/95 text-emerald-200",
            toast.variant === "destructive" && "border-red-500/50 bg-zinc-950/95 text-red-200",
            (toast.variant ?? "default") === "default" && "border-zinc-700 bg-zinc-950/95 text-zinc-200"
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{toast.title}</p>
            {toast.description ? <p className="mt-0.5 break-words text-zinc-400">{toast.description}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss notification"
            className="-m-1 rounded p-1 text-muted hover:text-zinc-200"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
