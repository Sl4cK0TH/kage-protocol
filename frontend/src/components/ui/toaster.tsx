"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ToastMessage, subscribeToToasts } from "@/lib/toast";

export function Toaster() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    return subscribeToToasts((message) => {
      setToasts((current) => [...current, message]);
      setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== message.id));
      }, 3200);
    });
  }, []);

  return (
    <div className="fixed top-6 right-6 z-50 space-y-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "w-80 rounded-lg border px-4 py-3 text-sm shadow-xl backdrop-blur",
            toast.variant === "success" && "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
            toast.variant === "destructive" && "border-red-500/40 bg-red-500/10 text-red-200",
            toast.variant === "default" && "border-zinc-800 bg-zinc-950/80 text-zinc-200"
          )}
        >
          <p className="font-semibold uppercase tracking-[0.18em] text-xs">{toast.title}</p>
          {toast.description ? <p className="mt-1 text-xs text-zinc-400">{toast.description}</p> : null}
        </div>
      ))}
    </div>
  );
}
