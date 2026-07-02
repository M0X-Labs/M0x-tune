import React from "react";

interface StatusCardProps {
  label: string;
  value: string;
  subtext?: string;
  className?: string;
}

const statusColors: Record<string, string> = {
  idle: "bg-[var(--surface-subtle)] text-[var(--text-tertiary)] border-[var(--line)]",
  running: "bg-[var(--accent-dim)] text-[var(--accent-text)] border-[var(--accent)]/30 animate-pulse-soft",
  training: "bg-[var(--accent-dim)] text-[var(--accent-text)] border-[var(--accent)]/30 animate-pulse-soft",
  completed: "bg-[var(--emerald-dim)] text-[var(--emerald)] border-[var(--emerald)]/25",
  success: "bg-[var(--emerald-dim)] text-[var(--emerald)] border-[var(--emerald)]/25",
  failed: "bg-[var(--rose-dim)] text-[var(--rose)] border-[var(--rose)]/25",
  cancelled: "bg-[var(--surface-subtle)] text-[var(--text-tertiary)] border-[var(--line)]",
  queued: "bg-[var(--amber-dim)] text-[var(--amber)] border-[var(--amber)]/25",
};

export default function StatusCard({ label, value, subtext, className = "" }: StatusCardProps) {
  const valLower = value.toLowerCase();
  const statusStyle = statusColors[valLower];

  return (
    <div className={`relative rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 overflow-hidden shadow-sm hover-lift transition-all duration-300 ${className}`}>
      <span className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[var(--line-strong)]/20 to-transparent pointer-events-none" />
      <div className="text-[9.5px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.15em] mb-3">{label}</div>
      {statusStyle ? (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[10.5px] font-bold uppercase tracking-wider border ${statusStyle}`}>
          {value}
        </span>
      ) : (
        <div className="text-lg font-bold text-[var(--text-primary)] tracking-tight font-mono-num">{value}</div>
      )}
      {subtext && <div className="text-[10px] text-[var(--text-secondary)] mt-2 tracking-wide font-mono-num">{subtext}</div>}
    </div>
  );
}
