import type React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline" | "destructive";
  size?: "sm" | "md" | "lg";
}

export function Button({ className, variant = "default", size = "md", ...props }: ButtonProps) {
  const variants = {
    default: "bg-emerald-400 text-zinc-950 hover:bg-emerald-300",
    ghost: "text-zinc-200 hover:bg-zinc-900",
    outline: "border border-zinc-800 text-zinc-200 hover:border-emerald-400",
    destructive: "bg-red-500 text-white hover:bg-red-400"
  };
  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-5 text-base"
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium uppercase tracking-[0.18em] transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
