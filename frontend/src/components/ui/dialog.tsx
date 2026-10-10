"use client";

import { createContext, useContext, useId, useRef } from "react";
import type React from "react";
import { cn } from "@/lib/utils";
import { useDialogFocus } from "@/lib/useDialogFocus";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

const DialogIds = createContext<{ titleId: string; descriptionId: string } | null>(null);

/**
 * Modal dialog: role="dialog" + aria-modal, labelled by its DialogTitle,
 * Escape and backdrop close, and focus moved inside / restored on close.
 */
export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useDialogFocus(ref, open, () => onOpenChange(false));

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70" onClick={() => onOpenChange(false)} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-3xl focus:outline-none"
      >
        <DialogIds.Provider value={{ titleId, descriptionId }}>{children}</DialogIds.Provider>
      </div>
    </div>
  );
}

export function DialogContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl", className)}
      {...props}
    />
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-2", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const ids = useContext(DialogIds);
  return <h2 id={ids?.titleId} className={cn("text-lg font-semibold text-zinc-100", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-zinc-400", className)} {...props} />;
}
