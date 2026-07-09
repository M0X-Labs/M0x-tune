"use client";

import React, { useEffect, useRef, useState } from "react";
import { useLogs } from "../app/context/LogsContext";

export default function BottomTerminalPanel() {
  const { isOpen, activeService, closeLogsPanel, openLogsPanel } = useLogs();
  const [logs, setLogs] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  
  const esRef = useRef<EventSource | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen || !activeService) {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setStatus("disconnected");
      return;
    }

    setLogs([]);
    setStatus("connecting");

    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource(`/api/system/logs/${activeService}`);
    esRef.current = es;

    es.onopen = () => {
      setStatus("connected");
    };

    es.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data) as { text?: string };
        const logLine = data.text;
        if (logLine) {
          setLogs((prev) => [...prev.slice(-1000), logLine]);
        }
      } catch (err) {
        console.error("Failed to parse log event", err);
      }
    });

    es.onerror = () => {
      setStatus("disconnected");
      es.close();
      esRef.current = null;

      // Attempt reconnection
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      reconnectRef.current = setTimeout(() => {
        if (isOpen && activeService) {
          setStatus("connecting");
        }
      }, 3000);
    };

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [isOpen, activeService]);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  if (!isOpen || !activeService) return null;

  return (
    <div className="h-64 shrink-0 bg-black/95 rounded-xl border border-[var(--line)] shadow-2xl flex flex-col overflow-hidden text-[#e2e8f0] font-mono z-20">
      {/* VS Code Style Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#141414] border-b border-[#2d2d2d] select-none text-[11px] font-sans">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full transition-colors duration-300 ${
              status === "connected" ? "bg-emerald-500 animate-pulse" :
              status === "connecting" ? "bg-amber-500 animate-pulse" : "bg-red-500"
            }`} />
            <span className="font-semibold uppercase tracking-wider text-[10px] text-gray-400">
              Terminal: System Logs
            </span>
          </div>
          <div className="flex items-center gap-1 bg-[#252526] p-0.5 rounded border border-white/[0.05]">
            <button
              onClick={() => openLogsPanel("backend")}
              className={`px-2.5 py-0.5 rounded text-[10px] uppercase tracking-wider transition-colors ${
                activeService === "backend"
                  ? "bg-[#3d3d3d] text-white font-medium"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Backend
            </button>
            <button
              onClick={() => openLogsPanel("frontend")}
              className={`px-2.5 py-0.5 rounded text-[10px] uppercase tracking-wider transition-colors ${
                activeService === "frontend"
                  ? "bg-[#3d3d3d] text-white font-medium"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Frontend
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-gray-400 cursor-pointer hover:text-gray-200">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-[var(--accent)] cursor-pointer"
            />
            Auto-scroll
          </label>
          <button
            onClick={() => setLogs([])}
            className="text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d] px-2 py-0.5 rounded transition-all cursor-pointer"
          >
            Clear
          </button>
          <button
            onClick={closeLogsPanel}
            className="text-gray-400 hover:text-red-400 hover:bg-[#2d2d2d] px-2 py-0.5 rounded transition-all font-sans text-xs cursor-pointer"
            aria-label="Close logs panel"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1 text-xs select-text selection:bg-[#3d3d3d] selection:text-white scrollbar-thin scrollbar-thumb-gray-800">
        {logs.length === 0 ? (
          <div className="text-gray-500 italic text-[11px]">
            Awaiting log stream for {activeService}...
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="whitespace-pre-wrap break-all leading-relaxed hover:bg-white/[0.02] px-1 rounded">
              {log}
            </div>
          ))
        )}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
}
