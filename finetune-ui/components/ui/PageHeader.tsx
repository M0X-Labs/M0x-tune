import React from "react";

interface PageHeaderProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function PageHeader({ icon, title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-8 pb-5 border-b border-[var(--line)]">
      <div className="min-w-0">
        <div className="flex items-center gap-3.5">
          {icon && (
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--accent-dim)] text-[var(--accent-text)] text-[14px] border border-[var(--accent)]/25 shadow-sm shadow-[var(--accent)]/5 shrink-0">
              {icon}
            </span>
          )}
          <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight truncate leading-none">
            {title}
          </h1>
        </div>
        {description && (
          <p className="text-[11.5px] text-[var(--text-secondary)] mt-2.5 ml-12.5 leading-relaxed max-w-2xl">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
