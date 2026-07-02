import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
}

export default function Badge({ children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--surface-subtle)] text-[var(--text-secondary)] border border-[var(--line)] tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}
