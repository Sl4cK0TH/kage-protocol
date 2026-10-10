/**
 * Shared display formatting, so urgency colors and time formats are defined
 * once and stay consistent across the table, cards, drawer, and dashboard.
 */

/** "1h 03m", "28m 05s", "45s". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

export type TtlLevel = "ok" | "warning" | "critical";

/** Clones under 5 minutes are "warning", under 1 minute "critical". */
export function ttlLevel(seconds: number | null | undefined): TtlLevel {
  if (seconds === null || seconds === undefined) return "ok";
  if (seconds < 60) return "critical";
  if (seconds < 300) return "warning";
  return "ok";
}

/** Text color per level — never the only signal; pair with a label/icon. */
export const TTL_TEXT: Record<TtlLevel, string> = {
  ok: "text-zinc-200",
  warning: "text-amber-300",
  critical: "text-red-400"
};

export const TTL_LABEL: Record<TtlLevel, string | null> = {
  ok: null,
  warning: "Expiring soon",
  critical: "Expiring"
};

export function formatRelative(epochSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - epochSeconds);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/** Container status → dot color + whether it should pulse (only when healthy). */
export function statusTone(status: string): { dot: string; pulse: boolean } {
  if (status === "running") return { dot: "bg-emerald-400", pulse: true };
  if (status === "restarting" || status === "paused" || status === "created") return { dot: "bg-amber-400", pulse: false };
  return { dot: "bg-red-400", pulse: false };
}
