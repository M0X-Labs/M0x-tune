"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Layout from "../../components/Layout";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import PageHeader from "../../components/ui/PageHeader";

interface QuantizationMethod {
  value: string;
  label: string;
}

interface ConfigValues {
  localModelPath: string;
  codingDatasetPath: string;
  codingDatasetPaths: string[];
  outputGgufName: string;
  learningRate: number;
  maxSteps: number;
  batchSize: number;
  gradAccum: number;
  maxSeqLen: number;
  loraR: number;
  loraAlpha: number;
  quantization: string;
  use4bit: boolean;
  ropeScaling: string;
  warmupSteps: number;
  seed: number;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  hardware?: {
    gpu_name?: string;
    vram_mb?: number;
    vram_gb?: number;
  } | null;
}

const defaultValues: ConfigValues = {
  localModelPath: "./base_model",
  codingDatasetPath: "datasets/train_clean.parquet",
  codingDatasetPaths: [],
  outputGgufName: "m0x_m1",
  learningRate: 0.0002,
  maxSteps: 300,
  batchSize: 2,
  gradAccum: 4,
  maxSeqLen: 1024,
  loraR: 16,
  loraAlpha: 16,
  quantization: "q4_k_m",
  use4bit: true,
  ropeScaling: "none",
  warmupSteps: 10,
  seed: 3407,
};

const ROPE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "linear", label: "Linear" },
  { value: "dynamic", label: "Dynamic NTK" },
  { value: "yarn", label: "YaRN" },
];

const PRESET_PROFILES = [
  {
    name: "Fast & Light (8GB VRAM)",
    values: {
      learningRate: 0.0002,
      maxSteps: 150,
      batchSize: 1,
      gradAccum: 4,
      maxSeqLen: 512,
      loraR: 8,
      loraAlpha: 16,
      use4bit: true,
    }
  },
  {
    name: "Standard Balanced (16GB VRAM)",
    values: {
      learningRate: 0.0002,
      maxSteps: 300,
      batchSize: 2,
      gradAccum: 4,
      maxSeqLen: 1024,
      loraR: 16,
      loraAlpha: 16,
      use4bit: true,
    }
  },
  {
    name: "High Quality (24GB+ VRAM)",
    values: {
      learningRate: 0.0001,
      maxSteps: 500,
      batchSize: 4,
      gradAccum: 4,
      maxSeqLen: 2048,
      loraR: 32,
      loraAlpha: 64,
      use4bit: true,
    }
  },
  {
    name: "Quick Verification (Test Run)",
    values: {
      learningRate: 0.0002,
      maxSteps: 10,
      batchSize: 1,
      gradAccum: 1,
      maxSeqLen: 512,
      loraR: 8,
      loraAlpha: 16,
      use4bit: true,
    }
  }
];

const Slider = ({
  label,
  value,
  min,
  max,
  step,
  hint,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) => {
  const [editText, setEditText] = useState("");

  const display = format ? format(value) : String(value);

  const commitEdit = (text: string) => {
    const parsed = parseFloat(text);
    if (!isNaN(parsed)) {
      const clamped = Math.min(max, Math.max(min, parsed));
      const stepped = Math.round((clamped - min) / step) * step + min;
      onChange(Number(stepped.toFixed(10)));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-[0.08em]">
          {label}
        </label>
        <input
          type="text"
          value={editText}
          placeholder={display}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={() => { if (editText) { commitEdit(editText); setEditText(""); } }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { commitEdit((e.target as HTMLInputElement).value); setEditText(""); (e.target as HTMLInputElement).blur(); }
            if (e.key === "Escape") { setEditText(""); (e.target as HTMLInputElement).blur(); }
          }}
          className="w-24 text-[10px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] bg-[var(--surface-subtle)] border border-[var(--line)] rounded-md px-2 py-1 text-right outline-none transition-all duration-150 hover:border-[var(--line-strong)] focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:shadow-sm"
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
      <div className="flex justify-between text-[9px] text-[var(--text-tertiary)] mt-1 font-mono">
        <span>{format ? format(min) : min}</span>
        <span>{format ? format(max) : max}</span>
      </div>
      {hint && <div className="text-[9px] text-[var(--text-tertiary)] mt-1">{hint}</div>}
    </div>
  );
};

const Toggle = ({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <label className="flex items-start justify-between gap-3.5 p-4 border border-[var(--line)] rounded-xl bg-[var(--surface-subtle)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)] transition-all duration-200 cursor-pointer shadow-sm">
    <div className="flex-1 min-w-0">
      <div className="text-xs font-semibold text-[var(--text-primary)] tracking-wide">{label}</div>
      {description && <div className="text-[10px] text-[var(--text-tertiary)] mt-1 leading-relaxed">{description}</div>}
    </div>
    <span
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-200 ease-out ${
          checked ? "translate-x-4.5" : "translate-x-1"
        }`}
      />
    </span>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="sr-only"
    />
  </label>
);

export default function ConfigPage() {
  const router = useRouter();
  const [values, setValues] = useState<ConfigValues>(defaultValues);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quantizations, setQuantizations] = useState<QuantizationMethod[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);

  const [localModels, setLocalModels] = useState<{ id: string; localPath?: string }[]>([]);
  const [datasets, setDatasets] = useState<any[]>([]);
  const [hardwareInfo, setHardwareInfo] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const [configRes, quantRes, modelsRes, datasetsRes, hwRes] = await Promise.all([
          fetch("/api/config", { cache: "no-store" }),
          fetch("/api/config/validate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "quantizations" }),
          }),
          fetch("/api/models", { cache: "no-store" }),
          fetch("/api/datasets/list", { cache: "no-store" }),
          fetch("/api/hardware", { cache: "no-store" }),
        ]);
        if (configRes.ok) {
          const data = await configRes.json();
          setValues((prev) => {
            const loadedPaths = Array.isArray(data.codingDatasetPaths)
              ? data.codingDatasetPaths
              : data.codingDatasetPath
              ? [data.codingDatasetPath]
              : [];
            return {
              ...prev,
              ...data,
              learningRate: Number(data.learningRate ?? prev.learningRate),
              maxSteps: Number(data.maxSteps ?? prev.maxSteps),
              batchSize: Number(data.batchSize ?? prev.batchSize),
              gradAccum: Number(data.gradAccum ?? prev.gradAccum),
              maxSeqLen: Number(data.maxSeqLen ?? prev.maxSeqLen),
              loraR: Number(data.loraR ?? prev.loraR),
              loraAlpha: Number(data.loraAlpha ?? prev.loraAlpha),
              codingDatasetPath: String(data.codingDatasetPath ?? prev.codingDatasetPath),
              codingDatasetPaths: loadedPaths,
            };
          });
        }
        if (quantRes.ok) {
          const data = (await quantRes.json()) as { methods: QuantizationMethod[] };
          setQuantizations(data.methods ?? []);
        }
        if (modelsRes.ok) {
          const data = await modelsRes.json();
          setLocalModels(data.models ?? []);
        }
        if (datasetsRes.ok) {
          const data = await datasetsRes.json();
          setDatasets(data.datasets ?? []);
        }
        if (hwRes.ok) {
          const data = await hwRes.json();
          setHardwareInfo(data.hardware ?? null);
        }
      } catch (err) {
        console.error("Failed to load config:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const validate = useCallback(
    async (snapshot: ConfigValues) => {
      setValidating(true);
      try {
        const res = await fetch("/api/config/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "validate",
            payload: {
              localModelPath: snapshot.localModelPath,
              codingDatasetPath: snapshot.codingDatasetPath,
              codingDatasetPaths: snapshot.codingDatasetPaths,
              outputGgufName: snapshot.outputGgufName,
              learningRate: snapshot.learningRate,
              maxSteps: snapshot.maxSteps,
              perDeviceTrainBatchSize: snapshot.batchSize,
              gradientAccumulationSteps: snapshot.gradAccum,
              maxSeqLength: snapshot.maxSeqLen,
              loraR: snapshot.loraR,
              loraAlpha: snapshot.loraAlpha,
              quantization: snapshot.quantization,
              use4bit: snapshot.use4bit,
              ropeScaling: snapshot.ropeScaling === "none" ? null : snapshot.ropeScaling,
              warmupSteps: snapshot.warmupSteps,
              seed: snapshot.seed,
            },
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as ValidationResult;
          setValidation(data);
        }
      } catch (err) {
        console.error("Validation failed:", err);
      } finally {
        setValidating(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (loading) return;
    const handle = setTimeout(() => validate(values), 600);
    return () => clearTimeout(handle);
  }, [values, validate, loading]);

  const set = <K extends keyof ConfigValues>(key: K, value: ConfigValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const startFinetuning = useCallback(async () => {
    setSaving(true);
    try {
      const saveRes = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localModelPath: values.localModelPath,
          codingDatasetPath: values.codingDatasetPath,
          codingDatasetPaths: values.codingDatasetPaths,
          outputGgufName: values.outputGgufName,
          learningRate: values.learningRate,
          maxSteps: values.maxSteps,
          batchSize: values.batchSize,
          gradAccum: values.gradAccum,
          maxSeqLen: values.maxSeqLen,
          loraR: values.loraR,
          loraAlpha: values.loraAlpha,
        }),
      });
      if (!saveRes.ok) throw new Error("Failed to save configuration settings.");

      const trainRes = await fetch("/api/train", { method: "POST" });
      if (!trainRes.ok) {
        const errorData = await trainRes.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to start training session.");
      }
      router.push("/monitor");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert(`Error starting fine-tuning: ${message}`);
    } finally {
      setSaving(false);
    }
  }, [values, router]);

  const validationDisabled = useMemo(
    () => validation !== null && !validation.valid,
    [validation],
  );

  if (loading) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-8 py-8 flex items-center justify-center h-64 text-[10px] text-[var(--text-muted)] tracking-wide">
          Loading configuration...
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-8 py-8">
        <PageHeader
          icon="⚙"
          title="Hyperparameter Dashboard"
          description="Tune training settings and validate against your GPU before launch"
          action={
            <div className="flex items-center gap-2">
              {validation && (
                <span
                  className={`text-[9px] px-2 py-1 border rounded-full uppercase tracking-wider ${
                    validation.valid
                      ? "text-emerald-400/80 border-emerald-500/30"
                      : "text-red-400/80 border-red-500/30"
                  }`}
                >
                  {validating ? "checking..." : validation.valid ? "ready" : "fix errors"}
                </span>
              )}
              <Button onClick={startFinetuning} disabled={saving || validationDisabled}>
                {saving ? "Launching..." : "Start Fine-Tuning"}
              </Button>
            </div>
          }
        />

        {/* Preset Profiles & Pre-Flight HUD */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-5 md:col-span-2 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Hyperparameter Presets</h3>
              <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Quick-load configurations optimized for your GPU VRAM</p>
            </div>
            <select
              onChange={(e) => {
                const val = e.target.value;
                if (val !== "") {
                  const idx = parseInt(val, 10);
                  const preset = PRESET_PROFILES[idx];
                  setValues((prev) => ({
                    ...prev,
                    ...preset.values,
                  }));
                  // Reset select
                  e.target.value = "";
                }
              }}
              defaultValue=""
              className="bg-[var(--surface-subtle)] border border-[var(--line)] text-[var(--text-primary)] px-3 py-2 rounded-md text-xs focus:border-[var(--accent)] hover:border-[var(--line-strong)] focus:outline-none transition-colors w-full md:w-64 cursor-pointer font-medium"
            >
              <option value="" disabled>-- Select Preset Profile --</option>
              {PRESET_PROFILES.map((p, idx) => (
                <option key={idx} value={idx}>{p.name}</option>
              ))}
            </select>
          </Card>

          {/* Quick Hardware Status HUD */}
          <Card className="p-5 flex flex-col justify-center">
            <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-2.5">Hardware HUD</h3>
            {hardwareInfo ? (
              <div className="space-y-1.5 text-[11px] font-mono text-[var(--text-secondary)]">
                <div className="flex justify-between items-center">
                  <span>GPU:</span>
                  <span className="text-[var(--text-primary)] truncate max-w-[140px] font-semibold text-right" title={hardwareInfo.gpu_name}>
                    {hardwareInfo.gpu_name || "None"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>VRAM:</span>
                  <span className={`font-semibold ${hardwareInfo.vram_gb && hardwareInfo.vram_gb >= 15 ? "text-emerald-400" : hardwareInfo.vram_gb && hardwareInfo.vram_gb >= 8 ? "text-amber-400" : "text-red-400"}`}>
                    {hardwareInfo.vram_gb ? `${hardwareInfo.vram_gb} GB` : "N/A"}
                  </span>
                </div>
                {hardwareInfo.os === "win32" && hardwareInfo.pagefile && (
                  <div className="flex justify-between items-center">
                    <span>Pagefile:</span>
                    <span className={`font-semibold ${hardwareInfo.pagefile.total_pagefile_gb >= 32 ? "text-emerald-400" : "text-amber-400"}`}>
                      {hardwareInfo.pagefile.total_pagefile_gb} GB
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[10px] text-[var(--text-muted)] animate-pulse">Detecting hardware...</div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-5">
            <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Paths & Data</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-[var(--text-secondary)] mb-1 block uppercase tracking-wider">
                  Base Model
                </label>
                <select
                  value={values.localModelPath}
                  onChange={(e) => set("localModelPath", e.target.value)}
                  className="w-full bg-[var(--surface-subtle)] border border-[var(--line)] text-[var(--text-primary)] px-2.5 py-1.5 rounded-md text-xs focus:border-[var(--accent)] hover:border-[var(--line-strong)] focus:outline-none transition-all duration-150"
                >
                  <option value="./base_model">Default (./base_model)</option>
                  {localModels.map((m) => (
                    <option key={m.id} value={m.localPath || `base_model/${m.id}`}>
                      {m.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-secondary)] mb-1.5 block uppercase tracking-wider">
                  Training Datasets (Select 1 or more)
                </label>
                <div className="max-h-48 overflow-y-auto border border-[var(--line)] rounded-md bg-[var(--surface-subtle)] p-2.5 space-y-2">
                  <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={(values.codingDatasetPaths || []).includes("datasets/train_clean.parquet") || values.codingDatasetPath === "datasets/train_clean.parquet"}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        let updated = [...(values.codingDatasetPaths || [])];
                        if (checked) {
                          if (!updated.includes("datasets/train_clean.parquet")) {
                            updated.push("datasets/train_clean.parquet");
                          }
                          set("codingDatasetPath", "datasets/train_clean.parquet");
                        } else {
                          updated = updated.filter(p => p !== "datasets/train_clean.parquet");
                          if (updated.length > 0) {
                            set("codingDatasetPath", updated[0]);
                          } else {
                            set("codingDatasetPath", "");
                          }
                        }
                        set("codingDatasetPaths", updated);
                      }}
                      className="accent-[var(--accent)]"
                    />
                    <span className="truncate">Default (train_clean.parquet)</span>
                  </label>

                  {datasets.map((d) =>
                    (d.files ?? []).map((f: any) => {
                      const isChecked = (values.codingDatasetPaths || []).includes(f.path) || values.codingDatasetPath === f.path;
                      return (
                        <label key={f.path} className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              let updated = [...(values.codingDatasetPaths || [])];
                              if (values.codingDatasetPath && !updated.includes(values.codingDatasetPath)) {
                                updated.push(values.codingDatasetPath);
                              }
                              
                              if (checked) {
                                if (!updated.includes(f.path)) {
                                  updated.push(f.path);
                                }
                                set("codingDatasetPath", f.path);
                              } else {
                                updated = updated.filter(p => p !== f.path);
                                if (updated.length > 0) {
                                  set("codingDatasetPath", updated[0]);
                                } else {
                                  set("codingDatasetPath", "");
                                }
                              }
                              set("codingDatasetPaths", updated);
                            }}
                            className="accent-[var(--accent)]"
                          />
                          <span className="truncate" title={`${d.name} — ${f.name}`}>
                            {d.name} — {f.name}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                {(!values.codingDatasetPaths || values.codingDatasetPaths.length === 0) && !values.codingDatasetPath && (
                  <p className="text-[9px] text-red-400 mt-1">Please select at least one dataset.</p>
                )}
                {values.codingDatasetPaths && values.codingDatasetPaths.length > 0 && (
                  <p className="text-[9px] text-[var(--text-tertiary)] mt-1">
                    Selected: {values.codingDatasetPaths.length} dataset(s)
                  </p>
                )}
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-secondary)] mb-1 block uppercase tracking-wider">
                  Output Name
                </label>
                <Input
                  value={values.outputGgufName}
                  onChange={(e) => set("outputGgufName", e.target.value)}
                />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Training Scale</h3>
            <div className="space-y-4">
              <Slider
                label="Learning Rate"
                value={values.learningRate}
                min={0.00001}
                max={0.001}
                step={0.00001}
                format={(v) => v.toExponential(2)}
                onChange={(v) => set("learningRate", v)}
                hint="Typical 1e-5 to 5e-4 for LoRA"
              />
              <Slider
                label="Max Steps"
                value={values.maxSteps}
                min={10}
                max={2000}
                step={10}
                onChange={(v) => set("maxSteps", v)}
              />
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Memory Profile</h3>
            <div className="space-y-4">
              <Slider
                label="Batch Size"
                value={values.batchSize}
                min={1}
                max={16}
                step={1}
                onChange={(v) => set("batchSize", v)}
              />
              <Slider
                label="Grad Accumulation"
                value={values.gradAccum}
                min={1}
                max={32}
                step={1}
                onChange={(v) => set("gradAccum", v)}
              />
              <Slider
                label="Max Sequence Length"
                value={values.maxSeqLen}
                min={256}
                max={8192}
                step={128}
                onChange={(v) => set("maxSeqLen", v)}
                hint="Larger sequences consume more VRAM"
              />
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card className="p-5">
            <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-3">LoRA Adapters</h3>
            <div className="space-y-4">
              <Slider
                label="LoRA Rank"
                value={values.loraR}
                min={4}
                max={128}
                step={4}
                onChange={(v) => set("loraR", v)}
                hint="Higher rank increases capacity and VRAM"
              />
              <Slider
                label="LoRA Alpha"
                value={values.loraAlpha}
                min={4}
                max={128}
                step={4}
                onChange={(v) => set("loraAlpha", v)}
                hint="Usually 2x rank; lower for less aggressive updates"
              />
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Export</h3>
            <label className="text-[10px] text-[var(--text-secondary)] mb-1 block uppercase tracking-wider">
              Quantization Method
            </label>
            <select
              value={values.quantization}
              onChange={(e) => set("quantization", e.target.value)}
              className="w-full bg-[var(--surface-subtle)] border border-[var(--line)] text-[var(--text-primary)] px-3 py-2 rounded-md text-sm focus:border-[var(--accent)] hover:border-[var(--line-strong)] focus:outline-none transition-all duration-150"
            >
              {quantizations.length === 0 && <option value="q4_k_m">Q4_K_M (recommended)</option>}
              {quantizations.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-[var(--text-tertiary)] mt-2">
              Choose a quant that fits the target device. Q4_K_M is the best default for most desktop
              GPUs.
            </p>
          </Card>
        </div>

        <Card accent className="p-5 mb-6">
          <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Advanced</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Toggle
              label="4-bit Quantization (QLoRA)"
              description="Use bitsandbytes NF4 for memory efficiency"
              checked={values.use4bit}
              onChange={(v) => set("use4bit", v)}
            />
            <div>
              <label className="text-[10px] text-[var(--text-secondary)] mb-1 block uppercase tracking-wider">
                RoPE Scaling
              </label>
              <select
                value={values.ropeScaling}
                onChange={(e) => set("ropeScaling", e.target.value)}
                className="w-full bg-[var(--surface-subtle)] border border-[var(--line)] text-[var(--text-primary)] px-3 py-2 rounded-md text-sm focus:border-[var(--accent)] hover:border-[var(--line-strong)] focus:outline-none transition-all duration-150"
              >
                {ROPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[9px] text-[var(--text-tertiary)] mt-1">Extend effective context length.</p>
            </div>
            <div>
              <Slider
                label="Warmup Steps"
                value={values.warmupSteps}
                min={0}
                max={100}
                step={1}
                onChange={(v) => set("warmupSteps", v)}
              />
            </div>
          </div>
        </Card>

        {/* Pre-flight Checks checklist HUD */}
        <Card className="p-5 mb-6">
          <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-3 block">Pre-Flight Diagnostic Checklist</h3>
          
          <div className="space-y-3 mb-4 text-xs">
            {/* GPU Check */}
            <div className="flex items-center gap-2.5">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${hardwareInfo?.has_nvidia_gpu ? "bg-emerald-500" : "bg-red-500"}`}>
                {hardwareInfo?.has_nvidia_gpu ? "✓" : "✗"}
              </span>
              <div className="flex-1">
                <span className="font-medium text-[var(--text-primary)]">GPU Accelerator: </span>
                <span className="text-[var(--text-secondary)]">
                  {hardwareInfo?.has_nvidia_gpu ? `${hardwareInfo.gpu_name} (${hardwareInfo.vram_gb} GB VRAM)` : "No NVIDIA GPU detected. Training is unsupported."}
                </span>
              </div>
            </div>

            {/* CUDA Check */}
            <div className="flex items-center gap-2.5">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${hardwareInfo?.selected_cuda_tag && hardwareInfo.selected_cuda_tag !== "cpu" ? "bg-emerald-500" : "bg-amber-500"}`}>
                {hardwareInfo?.selected_cuda_tag && hardwareInfo.selected_cuda_tag !== "cpu" ? "✓" : "!"}
              </span>
              <div className="flex-1">
                <span className="font-medium text-[var(--text-primary)]">CUDA Runtime Compatibility: </span>
                <span className="text-[var(--text-secondary)]">
                  {hardwareInfo?.max_cuda_version ? `Driver supports CUDA ${hardwareInfo.max_cuda_version} (${hardwareInfo.selected_cuda_tag})` : "CUDA not detected. Performance will be degraded."}
                </span>
              </div>
            </div>

            {/* Pagefile Check */}
            {hardwareInfo?.os === "win32" && (
              <div className="flex items-start gap-2.5">
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white mt-0.5 ${hardwareInfo.pagefile && hardwareInfo.pagefile.total_pagefile_gb >= 32 ? "bg-emerald-500" : "bg-amber-500"}`}>
                  {hardwareInfo.pagefile && hardwareInfo.pagefile.total_pagefile_gb >= 32 ? "✓" : "!"}
                </span>
                <div className="flex-1">
                  <span className="font-medium text-[var(--text-primary)]">Windows Virtual Memory (Pagefile): </span>
                  <span className="text-[var(--text-secondary)]">
                    {hardwareInfo.pagefile ? `${hardwareInfo.pagefile.total_pagefile_gb} GB allocated` : "Unknown size"}
                  </span>
                  {hardwareInfo.pagefile && hardwareInfo.pagefile.total_pagefile_gb < 32 && (
                    <div className="mt-1 text-[10px] text-amber-300 bg-amber-500/5 border border-amber-500/20 rounded-md p-2">
                      <strong>Warning:</strong> Pagefile is below 32GB. Exporting models to GGUF format on Windows using llama.cpp is memory-intensive and may crash. Run <code>setup.bat</code> or expand your system virtual memory.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Validation Warnings/Errors from backend pre-flight API */}
          {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
            <div className="border-t border-[var(--line)] pt-3 mt-3 space-y-2">
              {validation.errors.map((e) => (
                <div
                  key={`e-${e}`}
                  className="text-[11px] text-red-400/80 px-3 py-1.5 border border-red-500/20 rounded-md bg-red-500/5"
                >
                  {e}
                </div>
              ))}
              {validation.warnings.map((w) => (
                <div
                  key={`w-${w}`}
                  className="text-[11px] text-amber-300/80 px-3 py-1.5 border border-amber-500/20 rounded-md bg-amber-500/5"
                >
                  {w}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
