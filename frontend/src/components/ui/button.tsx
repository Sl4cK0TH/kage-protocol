import type React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * - default: primary action (emerald)
   * - outline / ghost: secondary actions
   * - destructive: confirmed, irreversible actions (solid red-600, 4.8:1 contrast)
   * - danger: routine destructive entry points (quiet red outline) — they open a
   *   confirmation, so they shouldn't shout louder than the primary action
   */
  variant?: "default" | "ghost" | "outline" | "destructive" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  /** Disables the button and shows a spinner, preventing double submission. */
  loading?: boolean;
}

export function Button({
  className,
  variant = "default",
  size = "md",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const variants = {
    default: "bg-emerald-400 text-zinc-950 hover:bg-emerald-300",
    ghost: "text-zinc-200 hover:bg-zinc-900",
    outline: "border border-zinc-700 text-zinc-200 hover:border-emerald-400 hover:text-white",
    // Hover darkens: white on red-500 is only 3.8:1, red-700 is 6.5:1.
    destructive: "bg-red-600 text-white hover:bg-red-700",
    danger: "border border-red-500/40 text-red-300 hover:border-red-400 hover:bg-red-500/10 hover:text-red-200"
  };
  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-5 text-base",
    icon: "h-10 w-10"
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium uppercase tracking-[0.08em] transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
