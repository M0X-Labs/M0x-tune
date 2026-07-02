import React from "react";

interface StatsCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  trend?: {
    value: number;
    label: string;
    positive?: boolean;
  };
  icon: React.ReactNode;
  color?: "violet" | "cyan" | "emerald" | "amber" | "rose";
  className?: string;
}

const colorMap = {
  violet: {
    bg: "bg-[var(--accent-dim)]",
    border: "border-[var(--accent)]/20",
    text: "text-[var(--accent-text)]",
    hoverText: "group-hover:text-[var(--accent-text)]",
    accent: "from-[var(--accent)]/12 via-[var(--accent)]/4 to-transparent",
    shadow: "shadow-violet-500/10",
  },
  cyan: {
    bg: "bg-[var(--cyan-dim)]",
    border: "border-[var(--cyan)]/25",
    text: "text-[var(--cyan)]",
    hoverText: "group-hover:text-[var(--cyan)]",
    accent: "from-[var(--cyan)]/15 via-[var(--cyan)]/4 to-transparent",
    shadow: "shadow-cyan-500/10",
  },
  emerald: {
    bg: "bg-[var(--emerald-dim)]",
    border: "border-[var(--emerald)]/25",
    text: "text-[var(--emerald)]",
    hoverText: "group-hover:text-[var(--emerald)]",
    accent: "from-[var(--emerald)]/15 via-[var(--emerald)]/4 to-transparent",
    shadow: "shadow-emerald-500/10",
  },
  amber: {
    bg: "bg-[var(--amber-dim)]",
    border: "border-[var(--amber)]/25",
    text: "text-[var(--amber)]",
    hoverText: "group-hover:text-[var(--amber)]",
    accent: "from-[var(--amber)]/15 via-[var(--amber)]/4 to-transparent",
    shadow: "shadow-amber-500/10",
  },
  rose: {
    bg: "bg-[var(--rose-dim)]",
    border: "border-[var(--rose)]/25",
    text: "text-[var(--rose)]",
    hoverText: "group-hover:text-[var(--rose)]",
    accent: "from-[var(--rose)]/15 via-[var(--rose)]/4 to-transparent",
    shadow: "shadow-rose-500/10",
  },
};

export default function StatsCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  color = "violet",
  className = "",
}: StatsCardProps) {
  const colors = colorMap[color];

  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl border border-[var(--line)] hover:border-[var(--line-strong)]
        bg-[var(--surface)]
        transition-all duration-300 hover-lift
        group cursor-default shadow-sm
        ${className}
      `}
    >
      {/* Top edge highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />

      <div className="relative p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-2.5">
              <span className={`w-1 h-1 rounded-full ${colors.text.replace("text-", "bg-")}`} />
              <p className="text-[10px] font-semibold text-[var(--text-muted)] tracking-[0.12em] uppercase">
                {title}
              </p>
            </div>
            
            <div className="text-[28px] font-bold text-[var(--text-primary)] tracking-tight leading-none font-mono-num">
              {value}
            </div>
            
            {subtitle && (
              <p className="text-[11px] text-[var(--text-secondary)] mt-2.5 truncate">{subtitle}</p>
            )}
            
            {trend && (
              <div className="flex items-center gap-1.5 mt-2.5">
                <span
                  className={`text-[10.5px] font-semibold ${
                    trend.positive ? "text-[var(--emerald)]" : "text-[var(--rose)]"
                  }`}
                >
                  {trend.positive ? "↑" : "↓"} {Math.abs(trend.value)}%
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">{trend.label}</span>
              </div>
            )}
          </div>

          <div className="relative shrink-0">
            <div
              className="w-11 h-11 rounded-xl bg-[var(--surface-subtle)] border border-[var(--line)] flex items-center justify-center transition-all duration-300 group-hover:scale-105"
            >
              <span className={colors.text}>{icon}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
