import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "gradient" | "glow" | "minimal";
  accent?: boolean;
  interactive?: boolean;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  onClick?: () => void;
}

export default function Card({
  children,
  className = "",
  variant = "default",
  accent = false,
  interactive = false,
  header,
  footer,
  onClick,
}: CardProps) {
  const baseStyles = "relative rounded-2xl overflow-hidden transition-all duration-300";

  const variantStyles = {
    default: "bg-[var(--surface)] border border-[var(--line)] shadow-sm",
    gradient: "bg-gradient-to-br from-[var(--surface)] to-[var(--surface-subtle)] border border-[var(--line)] shadow-sm",
    glow: "bg-[var(--surface)]/90 backdrop-blur-md border border-[var(--accent)]/30 shadow-[0_0_20px_rgba(124,58,237,0.04)]",
    minimal: "bg-transparent",
  };

  const interactiveStyles = interactive
    ? "cursor-pointer hover-lift"
    : "";

  return (
    <div
      onClick={onClick}
      className={`
        ${baseStyles}
        ${variantStyles[variant]}
        ${interactiveStyles}
        ${className}
      `}
    >
      {/* Top edge highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--line-strong)]/30 to-transparent pointer-events-none" />

      {accent && (
        <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent pointer-events-none" />
      )}

      {header && (
        <div className="px-6 py-4.5 border-b border-[var(--line)] bg-[var(--surface-subtle)]/40 backdrop-blur-sm">
          {header}
        </div>
      )}
      
      <div className="px-6 py-6">{children}</div>
      
      {footer && (
        <div className="px-6 py-4 border-t border-[var(--line)] bg-[var(--surface-subtle)]/20">
          {footer}
        </div>
      )}
    </div>
  );
}
