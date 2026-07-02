"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Layout from "../../components/Layout";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import StatusCard from "../../components/ui/StatusCard";
import Terminal from "../../components/ui/Terminal";

type TrainStatus = "idle" | "training" | "completed" | "failed" | "queued" | "cancelled" | "running";

interface LossPoint {
  step: number;
  value: number;
}

interface LrPoint {
  step: number;
  value: number;
}

const TRAINABLE_STATUSES = new Set<TrainStatus>(["training", "running", "queued"]);

const formatPercent = (n: number) => `${n.toFixed(1)}%`;

const formatTime = (info?: string | null) => info ?? "—";

export default function MonitorPage() {
  const [status, setStatus] = useState<TrainStatus>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [percent, setPercent] = useState(0);
  const [step, setStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(300);
  const [timeInfo, setTimeInfo] = useState<string | null>(null);
  const [loss, setLoss] = useState<number | null>(null);
  const [lr, setLr] = useState<number | null>(null);
  const [epoch, setEpoch] = useState<number>(0);
  const [lossHistory, setLossHistory] = useState<LossPoint[]>([]);
  const [lrHistory, setLrHistory] = useState<LrPoint[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<"all" | "errors">("all");
  const [connectionState, setConnectionState] = useState<"connecting" | "open" | "closed" | "error">(
    "connecting",
  );
  const esRef = useRef<EventSource | null>(null);
  const stepCounter = useRef<number>(0);

  const streamUrl = useMemo(() => {
    if (!jobId) return "/api/train";
    return `/api/train?jobId=${encodeURIComponent(jobId)}`;
  }, [jobId]);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setConnectionState("connecting");
    const es = new EventSource(streamUrl);
    esRef.current = es;

    es.addEventListener("status", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { status?: string; jobId?: string };
        if (data.status) setStatus(data.status as TrainStatus);
        if (data.jobId) setJobId(data.jobId);
      } catch {
        // ignore malformed event
      }
    });

    es.addEventListener("progress", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as {
          percent?: number;
          step?: number;
          totalSteps?: number;
          timeInfo?: string;
        };
        if (typeof data.percent === "number") setPercent(data.percent);
        if (typeof data.step === "number") setStep(data.step);
        if (typeof data.totalSteps === "number") setTotalSteps(data.totalSteps);
        if (typeof data.timeInfo === "string") setTimeInfo(data.timeInfo);
      } catch {
        // ignore malformed event
      }
    });

    es.addEventListener("metrics", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as {
          loss?: number | null;
          learningRate?: number | null;
          epoch?: number;
        };
        if (typeof data.loss === "number") {
          setLoss(data.loss);
          stepCounter.current += 1;
          const nextStep = stepCounter.current * 10;
          setLossHistory((prev) => [...prev, { step: nextStep, value: data.loss as number }]);
        }
        if (typeof data.learningRate === "number") {
          setLr(data.learningRate);
          setLrHistory((prev) => [...prev, { step: stepCounter.current * 10, value: data.learningRate as number }]);
        }
        if (typeof data.epoch === "number") {
          setEpoch(data.epoch);
        }
      } catch {
        // ignore malformed event
      }
    });

    es.addEventListener("log", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { text?: string };
        if (typeof data.text === "string" && data.text.length > 0) {
          setLogs((prev) => [...prev.slice(-600), data.text as string]);
        }
      } catch {
        // ignore malformed event
      }
    });

    es.onopen = () => setConnectionState("open");
    es.onerror = () => {
      setConnectionState("error");
      es.close();
      esRef.current = null;
      setTimeout(connect, 3000);
    };
  }, [streamUrl]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);

  const terminateFinetuning = useCallback(async () => {
    if (!confirm("Are you sure you want to terminate training?")) return;
    try {
      const res = await fetch("/api/train", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to terminate training.");
      setStatus("cancelled");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert(`Error terminating: ${message}`);
    }
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    setLossHistory([]);
    setLrHistory([]);
    stepCounter.current = 0;
  }, []);

  const filteredLogs = useMemo(() => {
    if (filter === "errors") {
      return logs.filter((line) =>
        line.includes("[ERROR]") || line.includes("Traceback") || line.includes("Error:"),
      );
    }
    return logs;
  }, [filter, logs]);

  const sparkline = (points: { step: number; value: number }[], color: string, fillId: string) => {
    if (points.length < 2) {
      return (
        <div className="h-40 flex items-center justify-center text-[10px] text-[var(--text-muted)] tracking-wide">
          Awaiting signal...
        </div>
      );
    }
    const w = 800;
    const h = 200;
    const pl = 50;
    const pr = 20;
    const pt = 16;
    const pb = 32;
    const cw = w - pl - pr;
    const ch = h - pt - pb;
    const values = points.map((p) => p.value);
    const mn = Math.min(...values);
    const mx = Math.max(...values);
    const rng = mx - mn || 1;
    const minStep = points[0].step;
    const maxStep = points[points.length - 1].step;
    const stepRange = maxStep - minStep || 1;
    const sx = (s: number) => pl + ((s - minStep) / stepRange) * cw;
    const sy = (v: number) => pt + ((v - mn) / rng) * ch;
    const pts = points.map((p) => `${sx(p.step)},${sy(p.value)}`).join(" ");
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40 overflow-visible">
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((i) => {
          const y = pt + (i / 4) * ch;
          return (
            <g key={i}>
              <line x1={pl} y1={y} x2={w - pr} y2={y} stroke="var(--line)" strokeWidth="1" />
              <text x={pl - 8} y={y + 3} textAnchor="end" fill="var(--text-muted)" fontSize="8">
                {(mx - (i / 4) * rng).toFixed(4)}
              </text>
            </g>
          );
        })}
        <line x1={pl} y1={h - pb} x2={w - pr} y2={h - pb} stroke="var(--line-strong)" strokeWidth="1" />
        <line x1={pl} y1={pt} x2={pl} y2={h - pb} stroke="var(--line-strong)" strokeWidth="1" />
        <polygon
          points={`${sx(minStep)},${h - pb} ${pts} ${sx(maxStep)},${h - pb}`}
          fill={`url(#${fillId})`}
        />
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points
          .filter((_, i) => i % Math.max(1, Math.floor(points.length / 20)) === 0)
          .map((p, i) => (
            <circle key={i} cx={sx(p.step)} cy={sy(p.value)} r="2" fill={color} stroke="#000" strokeWidth="1" />
          ))}
      </svg>
    );
  };

  const lossChart = useMemo(
    () => sparkline(lossHistory, "#3b82f6", "lossFill"),
    [lossHistory],
  );
  const lrChart = useMemo(
    () => sparkline(lrHistory, "#22d3ee", "lrFill"),
    [lrHistory],
  );

  const isTraining = TRAINABLE_STATUSES.has(status);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-8 py-8">
        <PageHeader
          icon="◐"
          title="Monitor"
          description="Real-time training telemetry"
          action={
            <div className="flex items-center gap-2">
              <span
                className={`text-[9px] px-2 py-1 border rounded-full uppercase tracking-wider ${
                  connectionState === "open"
                    ? "text-emerald-400/80 border-emerald-500/30"
                    : connectionState === "error"
                      ? "text-red-400/80 border-red-500/30"
                      : "text-[var(--text-muted)] border-[var(--line)]"
                }`}
              >
                {connectionState}
              </span>
              {jobId && (
                <span className="text-[9px] text-[var(--text-tertiary)] font-mono" title={jobId}>
                  Job {jobId.slice(0, 6)}
                </span>
              )}
            </div>
          }
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatusCard label="Status" value={status} />
          <StatusCard
            label="Progress"
            value={formatPercent(percent)}
            subtext={`${step} / ${totalSteps} • ETA ${formatTime(timeInfo)}`}
          />
          <StatusCard
            label="Loss"
            value={loss !== null ? loss.toFixed(6) : "—"}
            subtext={lossHistory.length > 0 ? `${lossHistory.length} samples` : undefined}
          />
          <StatusCard
            label="Learning Rate"
            value={lr !== null ? lr.toExponential(2) : "—"}
            subtext={epoch > 0 ? `Epoch ${epoch.toFixed(4)}` : undefined}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card accent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse-dot" />
                <span className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-[0.08em]">Loss Curve</span>
              </div>
              <span className="text-[9px] text-[var(--text-tertiary)]">steps vs loss</span>
            </div>
            {lossChart}
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/60" />
                <span className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-[0.08em]">Learning Rate</span>
              </div>
              <span className="text-[9px] text-[var(--text-tertiary)]">steps vs lr</span>
            </div>
            {lrChart}
          </Card>
        </div>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/40" />
              <span className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-[0.08em]">Console</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 p-0.5 bg-black rounded-md border border-white/[0.05]">
                {(["all", "errors"] as const).map((option) => (
                  <button
                    key={option}
                    onClick={() => setFilter(option)}
                    className={`px-2.5 py-1 rounded text-[10px] uppercase tracking-wider transition-colors ${
                      filter === option
                        ? "text-[var(--accent-text)] bg-[var(--accent-subtle)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Auto-scroll
              </label>
              <Button variant="ghost" onClick={clearLogs}>
                Clear
              </Button>
              {isTraining && (
                <Button variant="danger" onClick={terminateFinetuning}>
                  Terminate
                </Button>
              )}
            </div>
          </div>
          <Terminal logs={filteredLogs} height="h-80" emptyMessage="Awaiting telemetry stream..." />
          {!autoScroll && (
            <div className="text-[9px] text-[var(--text-tertiary)] mt-2 text-right tracking-wider uppercase">
              Auto-scroll disabled
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
