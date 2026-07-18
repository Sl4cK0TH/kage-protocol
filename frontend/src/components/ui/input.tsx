import type React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className, ...props }: InputProps) {
  return (
    <label className="block space-y-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
      {label ? <span>{label}</span> : null}
      <input
        className={cn(
          "w-full rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100",
          "focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400/40",
          className
        )}
        {...props}
      />
    </label>
  );
}
