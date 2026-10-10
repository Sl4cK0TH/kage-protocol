"use client";

import { useId } from "react";

interface SparklineProps {
  data: number[];
  /** Stroke/fill hue. Single-series charts carry identity via the title, so no legend is needed. */
  color?: string;
  height?: number;
  /** Fixed upper bound for the y-axis (e.g. 100 for a percentage). Auto-scales when omitted. */
  max?: number;
  className?: string;
  /** Accessible description, e.g. "CPU load trend, currently 12%". */
  label?: string;
}

/**
 * Minimal single-series area sparkline rendered as inline SVG.
 *
 * Follows the dataviz mark specs: a thin 2px line, a soft area fill anchored to
 * the baseline, a recessive baseline, and a single marker on the latest point
 * (selective direct marks, never one per point). One series → no legend.
 */
export function Sparkline({ data, color = "#62f7c6", height = 48, max, className, label = "Trend" }: SparklineProps) {
  const gradientId = useId();
  const width = 100; // viewBox units; the SVG scales to its container width.

  if (!data.length) {
    return <div style={{ height }} className={className} aria-hidden="true" />;
  }

  const upper = max ?? Math.max(1, ...data);
  const lower = 0;
  const range = upper - lower || 1;
  const stepX = width / Math.max(1, (data.length === 1 ? 2 : data.length) - 1);

  // A single sample has no trend yet: draw it as a flat line rather than a
  // wedge from the left edge (which read as a sudden drop to zero).
  const series = data.length === 1 ? [data[0], data[0]] : data;
  const points = series.map((value, index) => {
    const x = index * stepX;
    const clamped = Math.max(lower, Math.min(upper, value));
    // Keep 4 units of headroom so a value at the max isn't clipped by the edge.
    const y = height - ((clamped - lower) / range) * (height - 4);
    return [x, y] as const;
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      className={className}
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* recessive baseline */}
      <line x1="0" y1={height - 0.5} x2={width} y2={height - 0.5} stroke="currentColor" strokeOpacity="0.15" strokeWidth="0.5" />
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* single marker on the latest value */}
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
