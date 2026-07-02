"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "../app/context/ThemeContext";
import { useLogs } from "../app/context/LogsContext";

const ProfileAvatar = () => (
  <img
    src="/logo.png"
    alt="m0x-m1 Studio Logo"
    className="w-full h-full object-contain"
  />
);

const studioActions = [
  {
    path: "/",
    label: "Overview",
    badge: "1",
    icon: (
      <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-19.5 0A2.25 2.25 0 0 0 4.5 15h15a2.25 2.25 0 0 0 2.25-2.25m-19.5 0v.25A2.25 2.25 0 0 0 4.5 17.5h15a2.25 2.25 0 0 0 2.25-2.25v-.25m-19.5 0V9" />
      </svg>
    ),
  },
  {
    path: "/config",
    label: "Config",
    badge: "2",
    icon: (
      <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.43l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.645-.869L9.594 3.94z" />
      </svg>
    ),
  },
  {
    path: "/dataset",
    label: "Datasets",
    badge: "3",
    icon: (
      <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
  },
];

const deployActions = [
  {
    path: "/monitor",
    label: "Monitor",
    badge: "4",
    icon: (
      <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
      </svg>
    ),
  },
  {
    path: "/models",
    label: "Models",
    badge: "5",
    icon: (
      <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25m0-14.25v9m0-9l9 5.25M3 7.5v9l9 5.25m-9-5.25l9-5.25" />
      </svg>
    ),
  },
  {
    path: "/export",
    label: "Export",
    badge: "6",
    icon: (
      <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
  },
  {
    path: "/playground",
    label: "Playground",
    badge: "7",
    icon: (
      <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-1.074-.765 6.001 6.001 0 011.127-3.328C4.07 15.384 3 13.799 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
  },
];

const externalResources = [
  {
    label: "Discord",
    href: "https://discord.m0x.in",
  },
  {
    label: "Docs",
    href: "https://tune.m0x.in/docs",
  },
  {
    label: "GitHub Repo",
    href: "https://github.com/M0X-Labs/m0x-tune",
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { openLogsPanel, toggleLogsPanel, activeService } = useLogs();

  return (
    <aside className="w-full md:w-60 shrink-0 h-auto md:h-full flex flex-col justify-between py-6 px-4 text-[var(--text-secondary)] relative z-30 select-none bg-[var(--sidebar-bg)] rounded-xl md:rounded-2xl border border-[var(--line)] shadow-lg transition-all duration-300">
      {/* Profile Section */}
      <div className="flex items-center gap-3.5 px-2.5 mb-8">
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center">
            <ProfileAvatar />
          </div>
        </div>
        <div className="flex flex-col min-w-0">
          <div className="text-[13.5px] font-bold text-[var(--text-primary)] tracking-tight truncate leading-tight">
            m0x-m1 Studio
          </div>
          <div className="text-[10px] text-[var(--text-muted)] tracking-wide mt-0.5 truncate">
            Fine-Tuning Engine
          </div>
        </div>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 space-y-6 overflow-y-auto no-scrollbar pr-1">
        {/* WHAT I CREATE -> STUDIO ACTIONS */}
        <div>
          <div className="text-[9px] font-bold text-[var(--text-muted)] tracking-[0.25em] uppercase px-2.5 mb-2">
            WHAT I CREATE
          </div>
          <div className="space-y-0.5">
            {studioActions.map((item) => {
              const isActive =
                item.path === "/"
                  ? pathname === "/"
                  : pathname === item.path || pathname.startsWith(item.path + "/");
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`group flex items-center justify-between px-3 py-2 rounded-xl text-[12px] border transition-all duration-200 ${isActive
                    ? "text-[var(--text-primary)] font-semibold bg-[var(--surface-elevated)] border-[var(--accent)]/20 shadow-sm shadow-[var(--accent)]/5"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-transparent border-transparent hover:bg-[var(--surface)] hover:border-[var(--line)]/50"
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`shrink-0 transition-transform ${isActive ? "text-[var(--accent-text)] scale-105" : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"}`}>
                      {item.icon}
                    </span>
                    <span className="truncate tracking-wide">{item.label}</span>
                  </div>
                  <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-md min-w-[18px] text-center font-mono-num transition-all duration-200 ${isActive
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface)] text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] border border-[var(--line)]/50"
                    }`}>
                    {item.badge}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* WHAT I CONSUME -> MONITOR & DEPLOY */}
        <div>
          <div className="text-[9px] font-bold text-[var(--text-muted)] tracking-[0.25em] uppercase px-2.5 mb-2">
            WHAT I CONSUME
          </div>
          <div className="space-y-0.5">
            {deployActions.map((item) => {
              const isActive =
                pathname === item.path || pathname.startsWith(item.path + "/");
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`group flex items-center justify-between px-3 py-2 rounded-xl text-[12px] border transition-all duration-200 ${isActive
                    ? "text-[var(--text-primary)] font-semibold bg-[var(--surface-elevated)] border-[var(--accent)]/20 shadow-sm shadow-[var(--accent)]/5"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-transparent border-transparent hover:bg-[var(--surface)] hover:border-[var(--line)]/50"
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`shrink-0 transition-transform ${isActive ? "text-[var(--accent-text)] scale-105" : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"}`}>
                      {item.icon}
                    </span>
                    <span className="truncate tracking-wide">{item.label}</span>
                  </div>
                  <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-md min-w-[18px] text-center font-mono-num transition-all duration-200 ${isActive
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface)] text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] border border-[var(--line)]/50"
                    }`}>
                    {item.badge}
                  </span>
                </Link>
              );
            })}
            
            {/* System Logs Hover Selector */}
            <div className="relative group/logs">
              <button
                onClick={() => toggleLogsPanel(activeService || "backend")}
                className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-[12px] border border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] hover:border-[var(--line)]/50 transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="shrink-0 text-[var(--text-muted)] group-hover/logs:text-[var(--text-secondary)]">
                    <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.467 5.99 5.99 0 0 0-1.925 3.546 5.974 5.974 0 0 1-2.133-1A3.75 3.75 0 0 0 12 18Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2.25V4.5m0 15v2.25m-9-9h2.25m15 0H21m-2.225-6.225L17.15 8.275M6.875 18.525l-1.625-1.625m11.375 0 1.625 1.625M6.875 5.475 5.25 7.1" />
                    </svg>
                  </span>
                  <span className="truncate tracking-wide text-left">System Logs</span>
                </div>
                <span className="text-[var(--text-muted)] group-hover/logs:translate-x-0.5 transition-transform duration-200 text-[10px]">
                  ▶
                </span>
              </button>
              
              {/* Floating Hover Submenu */}
              <div className="absolute left-full top-0 ml-2 w-36 bg-[var(--sidebar-bg)] border border-[var(--line)] rounded-xl shadow-xl p-1.5 opacity-0 invisible group-hover/logs:opacity-100 group-hover/logs:visible transition-all duration-200 flex flex-col gap-1 z-40">
                <button
                  onClick={() => openLogsPanel("backend")}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
                >
                  Backend Logs
                </button>
                <button
                  onClick={() => openLogsPanel("frontend")}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
                >
                  Frontend Logs
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* WHERE TO FIND ME -> RESOURCES */}
        <div>
          <div className="text-[9px] font-bold text-[var(--text-muted)] tracking-[0.25em] uppercase px-2.5 mb-2">
            WHERE TO FIND ME
          </div>
          <div className="space-y-0.5">
            {externalResources.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between px-3 py-2 rounded-xl text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-transparent border border-transparent hover:bg-[var(--surface)] hover:border-[var(--line)]/50 transition-all duration-200"
              >
                <span className="truncate tracking-wide">{item.label}</span>
                <svg
                  className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </nav>

      {/* Footer Area */}
      <div className="mt-6 pt-4 border-t border-[var(--line)] space-y-3.5 px-2">
        <div className="flex items-center gap-4 text-[10.5px] text-[var(--text-muted)] font-medium">
          <a href="#" className="hover:text-[var(--text-primary)] transition-colors">
            Legals
          </a>
          <a href="#" className="hover:text-[var(--text-primary)] transition-colors">
            Changelog
          </a>
        </div>

        {/* Custom Theme Switcher Pill */}
        <div className="flex items-center bg-[var(--surface-subtle)] border border-[var(--line)] rounded-full px-2.5 py-1 text-[11px] text-[var(--text-primary)] w-32 justify-between select-none">
          <span className="font-medium tracking-wide text-[var(--text-primary)]">
            {theme === "light" ? "● Light" : "● Dark"}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setTheme("light")}
              className={`p-1 rounded-full transition-all duration-150 ${theme === "light"
                ? "bg-[var(--line-strong)] text-[var(--text-primary)] scale-110 shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              title="Light Mode"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`p-1 rounded-full transition-all duration-150 ${theme === "dark"
                ? "bg-[var(--line-strong)] text-[var(--text-primary)] scale-110 shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              title="Dark Mode"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
