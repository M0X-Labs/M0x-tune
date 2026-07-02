"use client";

import React from "react";

interface InputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  type?: string;
}

export default function Input({
  value,
  onChange,
  placeholder = "",
  className = "",
  type = "text",
}: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full bg-[var(--surface-subtle)] border border-[var(--line)] text-[var(--text-primary)] px-3.5 py-2 rounded-lg text-xs
        placeholder:text-[var(--text-muted)] transition-all duration-200
        hover:border-[var(--line-strong)] hover:bg-[var(--surface-subtle)]/75
        focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-dim)] focus:bg-[var(--surface)] ${className}`}
    />
  );
}
