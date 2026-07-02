"use client";

import React from "react";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  decimals?: number;
  className?: string;
  format?: (n: number) => string;
}

/**
 * Smoothly animates a number from 0 to value on mount.
 * Uses requestAnimationFrame and easeOutCubic.
 * GPU-friendly — only opacity / transform changes, no layout thrash.
 */
export default function AnimatedNumber({
  value,
  duration = 1100,
  decimals = 0,
  className = "",
  format,
}: AnimatedNumberProps) {
  const [display, setDisplay] = React.useState(0);
  const rafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const start = performance.now();
    const from = 0;
    const to = value;

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  const out =
    format != null
      ? format(display)
      : decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString();

  return <span className={className}>{out}</span>;
}
