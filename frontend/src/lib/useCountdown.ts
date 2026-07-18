import { useEffect, useRef, useState } from "react";

export function useCountdown(initialSeconds: number | null | undefined) {
  const [seconds, setSeconds] = useState(initialSeconds ?? 0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync when the parent provides a new initial value
  useEffect(() => {
    setSeconds(initialSeconds ?? 0);
  }, [initialSeconds]);

  // Single stable interval — only created/destroyed when transitioning
  // between active (> 0) and inactive (0), NOT on every tick
  useEffect(() => {
    if (seconds <= 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => {
        setSeconds((current) => {
          const next = current - 1;
          if (next <= 0 && intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return Math.max(0, next);
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // Only re-run when crossing the 0 boundary, not on every tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds > 0]);

  return seconds;
}
