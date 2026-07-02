import React from "react";
import Card from "./Card";

interface ProgressCardProps {
  title: string;
  progress: number;
  total?: number;
  current?: number;
  status: "idle" | "running" | "completed" | "failed";
  eta?: string;
  className?: string;
  onClick?: () => void;
}

const statusConfig = {
  idle: {
    color: "text-[var(--text-tertiary)]",
    text: "text-[var(--text-tertiary)]",
    bg: "bg-[var(--surface-subtle)]",
    border: "border-[var(--line)]",
    bar: "bg-[var(--line-strong)]",
    label: "Idle",
  },
  running: {
    color: "text-[var(--accent-text)]",
    text: "text-[var(--accent-text)]",
    bg: "bg-[var(--accent-dim)]",
    border: "border-[var(--accent)]/30",
    bar: "bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong)]",
    label: "Running",
  },
  completed: {
    color: "text-[var(--emerald)]",
    text: "text-[var(--emerald)]",
    bg: "bg-[var(--emerald-dim)]",
    border: "border-[var(--emerald)]/25",
    bar: "bg-gradient-to-r from-[var(--emerald)] to-[var(--emerald-strong)]",
    label: "Completed",
  },
  failed: {
    color: "text-[var(--rose)]",
    text: "text-[var(--rose)]",
    bg: "bg-[var(--rose-dim)]",
    border: "border-[var(--rose)]/25",
    bar: "bg-gradient-to-r from-[var(--rose)] to-[var(--rose-strong)]",
    label: "Failed",
  },
};

export default function ProgressCard({
  title,
  progress,
  total,
  current,
  status,
  eta,
  className = "",
  onClick,
}: ProgressCardProps) {
  const config = statusConfig[status];
  const percentage = Math.min(100, Math.max(0, progress));
  const isAnimating = status === "running";

  return (
    <Card
      variant="default"
      interactive={!!onClick}
      onClick={onClick}
      className={className}
    >
      <div className="p-6">
        <div className="flex items-start justify-between mb-4.5 gap-3">
          <div className="min-w-0">
            <h3 className="text-[13.5px] font-bold text-[var(--text-primary)] tracking-tight truncate">
              {title}
            </h3>
            <div className="flex items-center gap-2.5 mt-1.5">
              <span className="flex items-center gap-1.5">
                <span className={`status-dot ${status}`} />
                <span className={`text-[10.5px] font-semibold tracking-wide uppercase ${config.text}`}>
                  {config.label}
                </span>
              </span>
              {eta && status === "running" && (
                <>
                  <span className="text-[var(--line-strong)]">·</span>
                  <span className="text-[10.5px] text-[var(--text-muted)] font-mono-num">
                    ETA {eta}
                  </span>
                </>
              )}
            </div>
          </div>
          
          <div
            className="shrink-0 px-2.5 py-1 rounded-md bg-[var(--surface-subtle)] border border-[var(--line)]"
          >
            <span className={`text-[11px] font-bold font-mono-num ${config.text}`}>
              {percentage.toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="relative h-2 bg-[var(--line)] rounded-full overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${config.bar} transition-all duration-500 ease-out`}
              style={{ width: `${percentage}%` }}
            >
              {/* Highlight flare for the progress tip */}
              {percentage > 0 && percentage < 100 && (
                <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-white/40 blur-[1px] rounded-full" />
              )}
              {isAnimating && (
                <div className="absolute inset-0 animate-pulse-soft bg-white/10" />
              )}
            </div>
          </div>
          
          {(current !== undefined || total !== undefined) && (
            <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-mono-num tracking-wide">
              <span>{current !== undefined ? current.toLocaleString() : "—"}</span>
              <span>{total !== undefined ? total.toLocaleString() : "—"}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
