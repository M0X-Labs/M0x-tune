import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
}

export default function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  icon,
  iconPosition = "left",
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed";

  const variantStyles = {
    primary:
      "bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong)] text-white shadow-md shadow-[var(--accent)]/15 hover:shadow-[var(--accent)]/30 hover:scale-[1.02] hover:brightness-110 focus:ring-[var(--accent)] active:scale-[0.98]",
    secondary:
      "bg-[var(--surface-subtle)] text-[var(--text-primary)] border border-[var(--line)] hover:bg-[var(--line)] hover:border-[var(--line-strong)] hover:scale-[1.02] focus:ring-[var(--line-strong)] active:scale-[0.98] shadow-sm",
    ghost:
      "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] hover:scale-[1.02] focus:ring-[var(--line)] active:scale-[0.98]",
    danger:
      "bg-gradient-to-r from-[var(--rose)] to-[var(--rose-strong)] text-white shadow-md shadow-red-500/15 hover:shadow-red-500/30 hover:scale-[1.02] hover:brightness-110 focus:ring-red-500 active:scale-[0.98]",
    success:
      "bg-gradient-to-r from-[var(--emerald)] to-[var(--emerald-strong)] text-white shadow-md shadow-emerald-500/15 hover:shadow-emerald-500/30 hover:scale-[1.02] hover:brightness-110 focus:ring-emerald-500 active:scale-[0.98]",
  };

  const sizeStyles = {
    sm: "px-3 py-1.5 text-[11px] gap-1.5 rounded-md",
    md: "px-4.5 py-2 text-xs gap-2 rounded-lg",
    lg: "px-6 py-3 text-sm gap-2.5 rounded-xl",
  };

  const loadingSpinner = (
    <svg
      className="animate-spin h-3.5 w-3.5"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  return (
    <button
      className={`
        ${baseStyles}
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? "w-full" : ""}
        ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          {loadingSpinner}
          {children}
        </>
      ) : (
        <>
          {icon && iconPosition === "left" && <span className="shrink-0">{icon}</span>}
          {children}
          {icon && iconPosition === "right" && <span className="shrink-0">{icon}</span>}
        </>
      )}
    </button>
  );
}
