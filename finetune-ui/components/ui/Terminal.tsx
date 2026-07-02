"use client";

import React, { useRef, useEffect } from "react";

interface TerminalProps {
  logs: string[];
  emptyMessage?: string;
  className?: string;
  height?: string;
}

export default function Terminal({
  logs,
  emptyMessage = "Console idle. Waiting for output...",
  className = "",
  height = "h-64",
}: TerminalProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className={`w-full bg-[#050508] border border-white/[0.05] rounded-xl shadow-inner overflow-hidden flex flex-col ${className}`}>
      {/* Mac-style Window Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0a0a0f] border-b border-white/[0.03] select-none">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]/90" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]/90" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]/90" />
        </div>
        <div className="text-[9.5px] font-mono text-[var(--text-muted)] tracking-wider uppercase">
          Telemetry Monitor
        </div>
        <div className="w-12" /> {/* Spacer */}
      </div>

      {/* Terminal Log Console */}
      <div
        className={`flex-1 p-4 font-mono text-[11px] leading-relaxed overflow-y-auto custom-terminal-scrollbar ${height}`}
      >
        {logs.length === 0 ? (
          <div className="text-zinc-600 italic tracking-wide">{emptyMessage}</div>
        ) : (
          logs.map((log, idx) => {
            let color = "text-slate-300";
            if (log.includes("[ERROR]") || log.includes("Traceback") || log.includes("Error:")) {
              color = "text-rose-400";
            } else if (log.includes("[SYSTEM]") || log.includes("Saving") || log.includes("SUCCESS")) {
              color = "text-amber-400/90";
            } else if (log.includes("Loading") || log.includes(":")) {
              color = "text-cyan-400";
            } else if (log.includes("[INFO]")) {
              color = "text-blue-400";
            } else if (log.includes("completed") || log.includes("100%")) {
              color = "text-emerald-400";
            }
            return (
              <div key={`log-${idx}`} className={`${color} whitespace-pre-wrap break-all leading-5`}>
                <span className="text-zinc-700 select-none mr-2 font-light">›</span>
                {log}
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
