import React from "react";
import Sidebar from "./Sidebar";
import BottomTerminalPanel from "./BottomTerminalPanel";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative flex flex-col md:flex-row h-screen w-screen overflow-hidden text-[var(--text-primary)] p-3 md:p-5 gap-4 md:gap-5"
      style={{ backgroundColor: "var(--viewport-bg)" }}
    >
      {/* Sidebar - Left panel */}
      <Sidebar />

      {/* Main content + Bottom Terminal Container */}
      <div className="flex-1 flex flex-col h-full min-w-0 gap-4 md:gap-5 overflow-hidden">
        {/* Main card panel */}
        <main className="flex-1 min-w-0 bg-[var(--bg)] rounded-xl md:rounded-2xl border border-[var(--line)] shadow-2xl overflow-y-auto overflow-x-hidden relative z-10 p-6 md:p-8 scroll-smooth">
          {/* Subtle ambient gradient inside card */}
          <div className="pointer-events-none absolute -top-40 -right-40 w-96 h-96 rounded-full bg-[var(--accent)]/5 blur-3xl" />
          
          <div className="relative z-10 animate-fade-in">{children}</div>
        </main>

        {/* Bottom Terminal Panel */}
        <BottomTerminalPanel />
      </div>
    </div>
  );
}
