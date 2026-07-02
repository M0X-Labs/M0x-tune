"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Layout from "../../components/Layout";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import PageHeader from "../../components/ui/PageHeader";
import Badge from "../../components/ui/Badge";
import Terminal from "../../components/ui/Terminal";

interface QuantizationMethod {
  value: string;
  label: string;
}

interface ExportedFile {
  name: string;
  path: string;
  size_bytes: number;
  modified_at: number;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const formatDate = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleString();
};

interface HardwareInfo {
  has_nvidia_gpu?: boolean;
  gpu_name?: string;
  vram_mb?: number;
  vram_gb?: number;
  driver_version?: string;
  os?: string;
  pagefile?: {
    total_pagefile_mb?: number;
    total_pagefile_gb?: number;
    is_system_managed?: boolean;
  };
}

export default function ExportPage() {
  const [status, setStatus] = useState<string>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [exportId, setExportId] = useState<string | null>(null);
  const [quantizations, setQuantizations] = useState<QuantizationMethod[]>([]);
  const [selectedQuants, setSelectedQuants] = useState<string[]>(["q4_k_m"]);
  const [modelPath, setModelPath] = useState<string>("./m0x_m1_lora");
  const [outputName, setOutputName] = useState<string>("m0x_m1");
  const [maxSeqLen, setMaxSeqLen] = useState<number>(1024);
  const [exportedFiles, setExportedFiles] = useState<ExportedFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(true);
  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const esRef = useRef<EventSource | null>(null);

  const loadQuantizations = useCallback(async () => {
    try {
      const res = await fetch("/api/config/quantizations");
      if (res.ok) {
        const data = (await res.json()) as { methods: QuantizationMethod[] };
        setQuantizations(data.methods ?? []);
      }
    } catch (err) {
      console.error("Failed to load quantizations:", err);
    }
  }, []);

  const loadHardwareInfo = useCallback(async () => {
    try {
      // Use the config validate endpoint to get hardware info with minimal payload
      const res = await fetch("/api/config/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localModelPath: "./base_model",
          outputGgufName: "temp",
          learningRate: 0.0002,
          maxSteps: 100,
          perDeviceTrainBatchSize: 2,
          gradientAccumulationSteps: 4,
          maxSeqLength: 1024,
          loraR: 16,
          loraAlpha: 16,
          quantization: "q4_k_m",
          use4bit: true,
          warmupSteps: 10,
          seed: 3407,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { hardware?: HardwareInfo; warnings?: string[] };
        setHardwareInfo(data.hardware ?? null);
        setWarnings(data.warnings ?? []);
      }
    } catch (err) {
      console.error("Failed to load hardware info:", err);
    }
  }, []);

  const loadExportedFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const res = await fetch("/api/exports/files");
      if (res.ok) {
        const data = (await res.json()) as { files: ExportedFile[] };
        setExportedFiles(data.files ?? []);
      }
    } catch (err) {
      console.error("Failed to load exported files:", err);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    loadQuantizations();
    loadHardwareInfo();
    loadExportedFiles();
  }, [loadQuantizations, loadHardwareInfo, loadExportedFiles]);

  const startExport = useCallback(async () => {
    if (selectedQuants.length === 0) {
      alert("Please select at least one quantization method");
      return;
    }

    try {
      const res = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelPath: modelPath,
          outputGgufName: outputName,
          maxSeqLength: maxSeqLen,
          quantizationMethods: selectedQuants,
        }),
      });

      if (!res.ok) throw new Error("Failed to start export");

      const data = (await res.json()) as { exportId: string; status: string };
      setExportId(data.exportId);
      setStatus("exporting");
      setLogs([]);

      // Connect to SSE
      if (esRef.current) esRef.current.close();
      const es = new EventSource(`/api/exports/${data.exportId}/events`);
      esRef.current = es;

      es.addEventListener("status", (e: MessageEvent) => {
        const statusData = JSON.parse(e.data);
        setStatus(statusData.status);
        if (statusData.status === "completed" || statusData.status === "failed") {
          loadExportedFiles();
        }
      });

      es.addEventListener("log", (e: MessageEvent) => {
        const logData = JSON.parse(e.data);
        setLogs((prev) => [...prev.slice(-400), logData.text]);
      });

      es.onerror = () => setTimeout(() => esRef.current?.close(), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert(`Error starting export: ${message}`);
    }
  }, [selectedQuants, modelPath, outputName, maxSeqLen, loadExportedFiles]);

  const cancelExport = useCallback(async () => {
    if (!exportId) return;
    try {
      await fetch(`/api/exports/${exportId}`, { method: "DELETE" });
      setStatus("cancelled");
      esRef.current?.close();
    } catch (err) {
      console.error("Failed to cancel export:", err);
    }
  }, [exportId]);

  const toggleQuant = (value: string) => {
    setSelectedQuants((prev) =>
      prev.includes(value) ? prev.filter((q) => q !== value) : [...prev, value]
    );
  };

  const downloadFile = async (filename: string) => {
    try {
      const res = await fetch(`/api/exports/files/download/${filename}`);
      if (!res.ok) throw new Error("Failed to download file");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Download failed:", err);
      alert("Failed to download file");
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-8 py-8">
        <PageHeader
          icon="&#8595;"
          title="Model Export Hub"
          description="Merge LoRA adapters, export multiple quantization variants, and download GGUF files"
        />

        {warnings.length > 0 && (
          <Card className="p-4 mb-6 border-amber-500/30">
            <h3 className="text-[10px] uppercase tracking-wider text-amber-400 mb-3">
              ⚠️ Warnings
            </h3>
            <div className="space-y-2">
              {warnings.map((warning, i) => (
                <div
                  key={i}
                  className="text-[11px] text-amber-300/90 px-3 py-2 border border-amber-500/20 rounded-md bg-amber-500/5"
                >
                  {warning}
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-5 md:col-span-2">
            <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
              Export Configuration
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-[var(--text-secondary)] mb-1 block uppercase tracking-wider">
                    LoRA Model Path
                  </label>
                  <Input
                    value={modelPath}
                    onChange={(e) => setModelPath(e.target.value)}
                    placeholder="./m0x_m1_lora"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-secondary)] mb-1 block uppercase tracking-wider">
                    Output Name
                  </label>
                  <Input
                    value={outputName}
                    onChange={(e) => setOutputName(e.target.value)}
                    placeholder="m0x_m1"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-secondary)] mb-1 block uppercase tracking-wider">
                  Max Sequence Length
                </label>
                <Input
                  type="number"
                  value={String(maxSeqLen)}
                  onChange={(e) => setMaxSeqLen(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-secondary)] mb-2 block uppercase tracking-wider">
                  Quantization Methods
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {quantizations.map((q) => {
                    const isSelected = selectedQuants.includes(q.value);
                    return (
                      <label
                        key={q.value}
                        className={`flex items-center gap-2.5 p-3 border rounded-xl cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                          isSelected
                            ? "border-[var(--accent)] bg-[var(--surface-elevated)]"
                            : "border-[var(--line)] bg-[var(--surface-subtle)]/30 hover:border-[var(--line-strong)] hover:bg-[var(--surface)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleQuant(q.value)}
                          className="w-3.5 h-3.5 rounded border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent-dim)] accent-[var(--accent)]"
                        />
                        <span className="text-[11.5px] font-medium text-[var(--text-primary)]">{q.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-2">
                  Select one or more quantization variants to export. Each will be a separate GGUF
                  file.
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Actions</h3>
            <div className="space-y-2">
              <Button
                onClick={startExport}
                disabled={status === "exporting" || selectedQuants.length === 0}
                className="w-full"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                {status === "exporting" ? "Exporting..." : "Start Export"}
              </Button>
              {status === "exporting" && (
                <Button variant="danger" onClick={cancelExport} className="w-full">
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z"
                    />
                  </svg>
                  Cancel
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={loadExportedFiles}
                className="w-full"
              >
                Refresh Files
              </Button>
            </div>
            <div className="mt-4 pt-4 border-t border-[var(--line)]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
                  Status
                </span>
                <Badge
                  className={
                    status === "exporting"
                      ? "bg-blue-500/10 text-blue-300"
                      : status === "completed"
                      ? "bg-emerald-500/10 text-emerald-300"
                      : status === "failed"
                      ? "bg-red-500/10 text-red-300"
                      : ""
                  }
                >
                  {status}
                </Badge>
              </div>
            </div>
          </Card>
        </div>

        <Card accent className="p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
              Export Log
            </h3>
            <Badge>llama.cpp</Badge>
          </div>
          <Terminal
            logs={logs}
            emptyMessage="Export log will appear here when you start an export..."
          />
        </Card>

        <Card className="p-5">
          <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
            Exported Files
          </h3>
          {loadingFiles ? (
            <div className="text-[10px] text-[var(--text-muted)] py-8 text-center">
              Loading files...
            </div>
          ) : exportedFiles.length === 0 ? (
            <div className="text-[10px] text-[var(--text-muted)] py-8 text-center">
              No exported GGUF files found. Complete an export to see files here.
            </div>
          ) : (
            <div className="space-y-2">
              {exportedFiles.map((file) => (
                <div
                  key={file.name}
                  className="flex items-center justify-between p-3 border border-[var(--line)] rounded-md bg-[var(--surface-subtle)] hover:border-[var(--line-strong)] transition-colors"
                >
                  <div>
                    <div className="text-sm text-[var(--text-primary)] font-mono truncate">{file.name}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">
                      {formatBytes(file.size_bytes)} • {formatDate(file.modified_at)}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => downloadFile(file.name)}
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Download
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
