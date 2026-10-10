import { useId } from "react";
import type React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Persistent helper text below the field (format, valid range…). */
  hint?: string;
  /** Validation message; marks the field invalid and replaces the hint. */
  error?: string | null;
  /** Monospace value — use for numbers, ports, and image references. */
  mono?: boolean;
}

/**
 * Labelled text input. The label's uppercase tracking styles only the label
 * text — previously the input sat inside the styled <label> and inherited its
 * letter-spacing, spacing typed values out ("3 0 0 0 0").
 */
export function Input({ label, hint, error, mono, className, id, ...props }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error || hint ? `${inputId}-desc` : undefined;

  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={inputId} className="block text-xs font-medium uppercase tracking-[0.12em] text-zinc-400">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "h-10 w-full rounded-md border bg-zinc-950/70 px-3 text-sm text-zinc-100 placeholder:text-muted",
          "focus:outline-none focus:ring-2",
          error
            ? "border-red-500/70 focus:border-red-400 focus:ring-red-400/30"
            : "border-zinc-700 focus:border-emerald-400 focus:ring-emerald-400/30",
          mono && "font-mono",
          className
        )}
        {...props}
      />
      {error ? (
        <p id={describedBy} className="text-xs text-red-300">
          {error}
        </p>
      ) : hint ? (
        <p id={describedBy} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
