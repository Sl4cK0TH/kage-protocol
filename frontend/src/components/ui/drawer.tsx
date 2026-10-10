"use client";

import { useRef } from "react";
import type React from "react";
import { cn } from "@/lib/utils";
import { useDialogFocus } from "@/lib/useDialogFocus";

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  /** Accessible name for the panel. */
  label: string;
}

/**
 * Right-hand slide-over panel with modal keyboard behavior (focus moved in and
 * restored, Tab contained, Escape closes). Hidden from assistive tech and the
 * tab order while closed.
 */
export function Drawer({ open, onOpenChange, children, label }: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, open, () => onOpenChange(false));

  return (
    <div
      // Becomes invisible only after the 200ms slide-out, so closing still animates.
      className={cn("fixed inset-0 z-50", open ? "visible" : "invisible transition-[visibility] duration-0 delay-200")}
      aria-hidden={!open}
    >
      <div
        className={cn("absolute inset-0 bg-black/70 transition-opacity duration-200", open ? "opacity-100" : "opacity-0")}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl focus:outline-none",
          "transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function DrawerHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-zinc-900 px-6 py-5", className)} {...props} />;
}

export function DrawerBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex-1 space-y-6 overflow-y-auto px-6 py-5", className)} {...props} />;
}

export function DrawerFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-t border-zinc-900 px-6 py-4", className)} {...props} />;
}
