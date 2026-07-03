"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Layout from "../components/Layout";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import StatsCard from "../components/ui/StatsCard";
import ProgressCard from "../components/ui/ProgressCard";
import AnimatedNumber from "../components/ui/AnimatedNumber";

interface DashboardStats {
  totalTrainings: number;
  completedTrainings: number;
  exportedModels: number;
  lastTraining: string | null;
}

interface ActiveJob {
  id: string;
  status: "idle" | "running" | "completed" | "failed";
  progress: number;
  currentStep: number;
  totalSteps: number;
  eta?: string;
}

const icons = {
  training: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  model: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25m0-14.25v9m0-9l9 5.25M3 7.5v9l9 5.25m-9-5.25l9-5.25" />
    </svg>
  ),
  export: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  ),
  success: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  arrow: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  ),
  pulse: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  cpu: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V8.25a2.25 2.25 0 00-2.25-2.25H8.25A2.25 2.25 0 006 8.25v7.5A2.25 2.25 0 008.25 18z" />
    </svg>
  ),
  memory: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9h6v6H9V9zm12 0h-3M3 9h3m12 6h3M3 15h3M9 3v3m6-3v3M9 18v3m6-3v3" />
    </svg>
  ),
};

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

  if (diffInHours < 1) return "Just now";
  if (diffInHours < 24) return `${diffInHours}h ago`;
  if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`;
  return date.toLocaleDateString();
}

interface HardwareInfo {
  has_nvidia_gpu?: boolean;
  gpu_name?: string | null;
  vram_mb?: number | null;
  vram_gb?: number | null;
  driver_version?: string | null;
  max_cuda_version?: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    totalTrainings: 0,
    completedTrainings: 0,
    exportedModels: 0,
    lastTraining: null,
  });
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date | null>(null);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);

  useEffect(() => {
    setNow(new Date());
    fetchDashboardData();
    fetchHardwareInfo();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const statsRes = await fetch("/api/train/stats");
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
      const jobRes = await fetch("/api/train/active");
      if (jobRes.ok) {
        const jobData = await jobRes.json();
        if (jobData.active) {
          setActiveJob(jobData.job);
        }
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHardwareInfo = async () => {
    try {
      const res = await fetch("/api/hardware");
      if (res.ok) {
        const data = await res.json();
        if (data.hardware) {
          setHardware(data.hardware);
        }
      }
    } catch (error) {
      console.error("Failed to fetch hardware info:", error);
    }
  };

  const successRate =
    stats.totalTrainings > 0
      ? Math.round((stats.completedTrainings / stats.totalTrainings) * 100)
      : 0;

  const quickActions = [
    {
      label: "New Training",
      description: "Configure & launch a fine-tune",
      icon: icons.training,
      href: "/config",
      color: "violet" as const,
    },
    {
      label: "Export Model",
      description: "Convert to GGUF format",
      icon: icons.export,
      href: "/export",
      color: "cyan" as const,
    },
    {
      label: "Live Monitor",
      description: "View real-time metrics",
      icon: icons.success,
      href: "/monitor",
      color: "emerald" as const,
    },
  ];

  return (
    <Layout>
      <div className="relative max-w-7xl mx-auto px-8 py-10">
        {/* Hero */}
        <section className="mb-10 animate-fade-in-up">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--surface-subtle)] border border-[var(--line)] mb-5 shadow-sm">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
                  <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </span>
                <span className="text-[10px] font-medium tracking-[0.15em] uppercase text-[var(--text-secondary)]">
                  Studio · Online
                </span>
                <span className="text-[10px] text-[var(--text-muted)] tracking-wider font-mono-num">
                  {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                </span>
              </div>

              <h1 className="text-balance text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
                <span className="text-[var(--text-primary)]">Fine-tune models</span>
                <br />
                <span className="gradient-text">with surgical precision.</span>
              </h1>
              <p className="mt-4 text-sm text-[var(--text-secondary)] max-w-xl leading-relaxed">
                Build, monitor and export optimized GGUF models in a single flow.
                 + QLoRA, accelerated on Blackwell.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="md"
                icon={icons.pulse}
                onClick={() => router.push("/config")}
              >
                Start training
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => router.push("/monitor")}
                icon={icons.arrow}
                iconPosition="right"
              >
                View monitor
              </Button>
            </div>
          </div>
        </section>

        {/* Active Job */}
        {activeJob && (
          <section className="mb-10 animate-fade-in-up stagger-1">
            <SectionHeader
              eyebrow="Active"
              title="Current job"
              accent="violet"
            />
            <div className="mt-4">
              <ProgressCard
                title={`Training Job · ${activeJob.id.slice(0, 8)}`}
                progress={activeJob.progress}
                current={activeJob.currentStep}
                total={activeJob.totalSteps}
                status={activeJob.status}
                eta={activeJob.eta}
                onClick={() => router.push("/monitor")}
              />
            </div>
          </section>
        )}

        {/* Stats */}
        <section className="mb-10">
          <SectionHeader
            eyebrow="Overview"
            title="Performance at a glance"
            accent="cyan"
          />
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="animate-fade-in-up stagger-1">
              <StatsCard
                title="Total Trainings"
                value={<AnimatedNumber value={stats.totalTrainings} />}
                subtitle={`${stats.completedTrainings} completed`}
                icon={icons.training}
                color="violet"
              />
            </div>
            <div className="animate-fade-in-up stagger-2">
              <StatsCard
                title="Success Rate"
                value={<AnimatedNumber value={successRate} format={(n) => `${Math.round(n)}%`} />}
                subtitle="Completion ratio"
                icon={icons.success}
                color="emerald"
              />
            </div>
            <div className="animate-fade-in-up stagger-3">
              <StatsCard
                title="Exported Models"
                value={<AnimatedNumber value={stats.exportedModels} />}
                subtitle="GGUF artifacts"
                icon={icons.model}
                color="cyan"
              />
            </div>
            <div className="animate-fade-in-up stagger-4">
              <StatsCard
                title="Last Training"
                value={formatTimeAgo(stats.lastTraining)}
                subtitle="Most recent run"
                icon={icons.export}
                color="amber"
              />
            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section className="mb-10">
          <SectionHeader
            eyebrow="Shortcuts"
            title="Jump into action"
            accent="emerald"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/config")}
                icon={icons.arrow}
                iconPosition="right"
              >
                Configure
              </Button>
            }
          />
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {quickActions.map((action, i) => (
              <QuickActionCard
                key={action.label}
                index={i}
                action={action}
                onClick={() => router.push(action.href)}
              />
            ))}
          </div>
        </section>

        {/* Bottom row: Activity + System */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 animate-fade-in-up stagger-1">
            <SectionHeader
              eyebrow="Timeline"
              title="Recent activity"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/monitor")}
                  icon={icons.arrow}
                  iconPosition="right"
                >
                  View all
                </Button>
              }
            />
            <div className="mt-4">
              <Card variant="default" className="overflow-hidden">
                {loading ? (
                  <div className="p-6 space-y-4">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="skeleton w-9 h-9 rounded-lg" />
                        <div className="flex-1 space-y-1.5">
                          <div className="skeleton h-3 w-2/3" />
                          <div className="skeleton h-2.5 w-1/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : stats.totalTrainings === 0 ? (
                  <EmptyState onStart={() => router.push("/config")} />
                ) : (
                  <ActivityList stats={stats} />
                )}
              </Card>
            </div>
          </div>

          <div className="animate-fade-in-up stagger-2">
            <SectionHeader eyebrow="Telemetry" title="System" accent="amber" />
            <div className="mt-4">
              <SystemHealthPanel hardware={hardware} />
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}

/* ---------- Sub-components ---------- */

function SectionHeader({
  eyebrow,
  title,
  accent = "violet",
  action,
}: {
  eyebrow: string;
  title: string;
  accent?: "violet" | "cyan" | "emerald" | "amber";
  action?: React.ReactNode;
}) {
  const dotColor = {
    violet: "bg-[var(--accent)]",
    cyan: "bg-[#22d3ee]",
    emerald: "bg-[#10b981]",
    amber: "bg-[#f59e0b]",
  }[accent];

  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`w-1 h-1 rounded-full ${dotColor}`} />
          <span className="text-[10px] font-medium text-[var(--text-tertiary)] tracking-[0.18em] uppercase">
            {eyebrow}
          </span>
        </div>
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)] tracking-tight">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

function QuickActionCard({
  action,
  index,
  onClick,
}: {
  action: {
    label: string;
    description: string;
    icon: React.ReactNode;
    color: "violet" | "cyan" | "emerald";
  };
  index: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl text-left p-6 bg-[var(--surface)] border border-[var(--line)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-elevated)] transition-all duration-200 hover-lift animate-fade-in-up stagger-${index + 1} shadow-sm`}
    >
      <div className="relative flex items-start gap-4.5">
        <div className="shrink-0">
          <div
            className="w-12 h-12 rounded-xl bg-[var(--surface-subtle)] border border-[var(--line)] flex items-center justify-center text-[var(--text-secondary)] transition-transform duration-300 group-hover:scale-105"
          >
            <span>{action.icon}</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-[13.5px] font-bold text-[var(--text-primary)] mb-1 tracking-wide">
            {action.label}
          </h3>
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            {action.description}
          </p>
        </div>

        <div className="shrink-0 w-8 h-8 rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] flex items-center justify-center text-[var(--text-muted)] group-hover:text-[var(--text-primary)] group-hover:border-[var(--line-strong)] group-hover:translate-x-0.5 transition-all duration-300 shadow-sm">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </div>
    </button>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative p-10 text-center overflow-hidden">
      <div className="relative">
        <div className="relative inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--line)] mb-4">
          <svg className="w-6 h-6 text-[var(--text-secondary)]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-[var(--text-primary)] tracking-tight mb-1.5">
          No activity yet
        </h3>
        <p className="text-[12px] text-[var(--text-tertiary)] max-w-xs mx-auto mb-5 leading-relaxed">
          Launch your first fine-tuning job and we&apos;ll stream live metrics here.
        </p>
        <Button variant="primary" size="sm" onClick={onStart} icon={icons.pulse}>
          Start training
        </Button>
      </div>
    </div>
  );
}

function ActivityList({ stats }: { stats: DashboardStats }) {
  const items = [
    {
      key: "last",
      status: stats.lastTraining ? "completed" : "idle",
      title: "Training completed",
      subtitle: "Model successfully exported to GGUF format",
      time: formatTimeAgo(stats.lastTraining),
    },
  ] as const;

  return (
    <div className="relative pl-6 py-2">
      {/* Timeline vertical bar */}
      <div className="absolute left-3.5 top-0 bottom-0 w-px bg-[var(--line)]" />

      <div className="space-y-6">
        {items.map((item) => (
          <div key={item.key} className="relative flex items-start gap-4 group">
            {/* Timeline node dot */}
            <div className="absolute -left-[19px] top-1 flex items-center justify-center w-3 h-3 rounded-full bg-[var(--surface)] border-2 border-[var(--emerald)] shadow-[0_0_8px_var(--emerald)] z-10 animate-pulse-soft" />

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-bold text-[var(--text-primary)] tracking-tight">
                  {item.title}
                </p>
                <span className="text-[10px] text-[var(--text-muted)] font-mono-num shrink-0">
                  {item.time}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                {item.subtitle}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SystemHealthPanel({ hardware }: { hardware: HardwareInfo | null }) {
  const hasGpu = hardware?.has_nvidia_gpu ?? false;
  const gpuName = hardware?.gpu_name || (hasGpu ? "NVIDIA GPU" : "CPU Mode");
  const vramText = hardware?.vram_gb ? `${hardware.vram_gb.toFixed(1)} GB VRAM` : "—";
  const driverText = hardware?.driver_version || "—";
  const cudaText = hardware?.max_cuda_version || "—";

  const metrics = [
    { label: "GPU", value: gpuName, icon: icons.cpu },
    { label: "VRAM Total", value: vramText, icon: icons.memory },
    { label: "Driver Version", value: driverText, icon: icons.pulse },
  ] as const;

  return (
    <Card variant="default">
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
              <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[var(--text-secondary)]">
              System Online
            </span>
          </div>
          <span className="text-[10px] text-[var(--text-muted)] font-mono-num tracking-wide">
            uptime 4d 12h
          </span>
        </div>

        <div className="space-y-3">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="flex items-center gap-3.5 p-3 rounded-xl border border-[var(--line)] bg-[var(--surface-subtle)]/30 hover:bg-[var(--surface-subtle)]/75 hover:border-[var(--line-strong)] transition-all duration-200"
            >
              <div
                className="shrink-0 w-9 h-9 rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] flex items-center justify-center shadow-sm"
              >
                {m.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[9.5px] font-semibold text-[var(--text-muted)] tracking-[0.1em] uppercase">
                  {m.label}
                </div>
                <div className="text-[12px] font-bold text-[var(--text-primary)] font-mono-num tracking-tight mt-0.5 truncate">
                  {m.value}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}