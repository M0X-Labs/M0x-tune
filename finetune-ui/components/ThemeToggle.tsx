"use client";

import React, { useState, useEffect } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Get initial theme from document class or localStorage
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (document.documentElement.classList.contains("dark")) {
      setTheme("dark");
    } else {
      setTheme("light");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    
    // Update document class
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(newTheme);
    
    // Save to localStorage
    localStorage.setItem("theme", newTheme);
  };

  // Prevent hydration mismatch - render nothing until mounted
  if (!mounted) {
    return (
      <button
        className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--surface-subtle)] border border-[var(--line)] opacity-50"
        aria-label="Toggle theme"
        disabled
      >
        <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4" fill="currentColor" />
        </svg>
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--surface-subtle)] hover:bg-[var(--line)] border border-[var(--line)] transition-all duration-200 group"
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      {theme === "dark" ? (
        /* Sun icon for dark mode (click to go light) */
        <svg
          className="w-4 h-4 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="4" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
          />
        </svg>
      ) : (
        /* Moon icon for light mode (click to go dark) */
        <svg
          className="w-4 h-4 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
          />
        </svg>
      )}
    </button>
  );
}
