"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Layout from "../../components/Layout";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";

interface LocalModel {
  id: string;
  localPath: string;
  configPath: string;
  sizeBytes: number;
  sizeGb: number;
  fileCount: number;
}

interface HubModel {
  id: string;
  downloads: number;
  likes: number;
  lastModified?: string | null;
  tags: string[];
  pipeline?: string | null;
  sizeBytes?: number | null;
  hasSafetensors?: boolean;
}

interface DownloadSnapshot {
  downloadId: string;
  repoId: string;
  targetPath: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  speedBps: number;
  log: string[];
  startedAt: string;
  finishedAt?: string | null;
  error?: string | null;
}

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = value;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
};

const statusStyles: Record<DownloadSnapshot["status"], string> = {
  queued: "text-[var(--text-muted)] border-[var(--line)]",
  running: "text-[var(--accent-text)] border-[var(--accent)]/30",
  completed: "text-emerald-400/80 border-emerald-500/30",
  failed: "text-red-400/80 border-red-500/30",
  cancelled: "text-[var(--text-tertiary)] border-[var(--line)]",
};

export default function ModelsPage() {
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [hubResults, setHubResults] = useState<HubModel[]>([]);
  const [downloads, setDownloads] = useState<DownloadSnapshot[]>([]);
  const [query, setQuery] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // File Explorer & Editor States
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [modelFiles, setModelFiles] = useState<{ name: string; sizeBytes: number; isJson: boolean }[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileSuccess, setFileSuccess] = useState<string | null>(null);

  const exploreModelFiles = useCallback(async (modelId: string) => {
    setSelectedModel(modelId);
    setLoadingFiles(true);
    setFileError(null);
    setFileSuccess(null);
    try {
      const res = await fetch(`/api/models/files?modelId=${encodeURIComponent(modelId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to load model files");
      }
      const data = (await res.json()) as { files: typeof modelFiles };
      setModelFiles(data.files ?? []);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Failed to load files");
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  const openJsonFile = useCallback(async (modelId: string, filePath: string) => {
    setEditingFile(filePath);
    setLoadingContent(true);
    setFileError(null);
    setFileSuccess(null);
    try {
      const res = await fetch(
        `/api/models/files/content?modelId=${encodeURIComponent(modelId)}&filePath=${encodeURIComponent(filePath)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to read file content");
      }
      const data = (await res.json()) as { content: string };
      setEditingContent(data.content ?? "");
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Failed to load file content");
      setEditingFile(null);
    } finally {
      setLoadingContent(false);
    }
  }, []);

  const saveJsonFile = useCallback(async () => {
    if (!selectedModel || !editingFile) return;
    setSavingContent(true);
    setFileError(null);
    setFileSuccess(null);

    // Frontend validation of JSON
    try {
      JSON.parse(editingContent);
    } catch (e) {
      setFileError(`Invalid JSON format: ${e instanceof Error ? e.message : "unknown syntax error"}`);
      setSavingContent(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/models/files/content?modelId=${encodeURIComponent(selectedModel)}&filePath=${encodeURIComponent(editingFile)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editingContent }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save file content");
      }
      setFileSuccess(`File ${editingFile} saved successfully!`);
      // Auto-refresh file sizes
      exploreModelFiles(selectedModel);
      // Close editor after delay
      setTimeout(() => {
        setEditingFile(null);
        setEditingContent("");
        setFileSuccess(null);
      }, 1500);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Failed to save file content");
    } finally {
      setSavingContent(false);
    }
  }, [selectedModel, editingFile, editingContent, exploreModelFiles]);

  const refreshLocal = useCallback(async () => {
    try {
      const res = await fetch("/api/models", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load local models");
      const data = (await res.json()) as { models: LocalModel[] };
      setLocalModels(data.models ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }, []);

  const refreshDownloads = useCallback(async () => {
    try {
      const res = await fetch("/api/models/downloads", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load download queue");
      const data = (await res.json()) as { downloads: DownloadSnapshot[] };
      setDownloads(data.downloads ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }, []);

  useEffect(() => {
    refreshLocal();
    refreshDownloads();
  }, [refreshLocal, refreshDownloads]);

  useEffect(() => {
    pollRef.current = setInterval(refreshDownloads, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refreshDownloads]);

  const search = useCallback(async () => {
    if (!query.trim()) {
      setHubResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", query, limit: 12 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Hub search failed");
      }
      const data = (await res.json()) as { results: HubModel[] };
      setHubResults(data.results ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hub search failed");
      setHubResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const startDownload = useCallback(
    async (repoId: string) => {
      setDownloading(repoId);
      setError(null);
      try {
        const res = await fetch("/api/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "download",
            repoId,
            token: token.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to start download");
        }
        await refreshDownloads();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start download");
      } finally {
        setDownloading(null);
      }
    },
    [token, refreshDownloads],
  );

  const cancelDownload = useCallback(
    async (downloadId: string) => {
      try {
        await fetch(`/api/models?downloadId=${encodeURIComponent(downloadId)}`, {
          method: "DELETE",
        });
        await refreshDownloads();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to cancel download");
      }
    },
    [refreshDownloads],
  );

  const activeDownload = useMemo(
    () => downloads.find((d) => d.status === "queued" || d.status === "running"),
    [downloads],
  );

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-8 py-8">
        <PageHeader
          icon="◈"
          title="Model Hub"
          description="Search, download, and manage Hugging Face models."
          action={
            <Button onClick={refreshLocal} variant="secondary">
              Refresh Local
            </Button>
          }
        />

        {error && (
          <div className="mb-4 px-3 py-2 text-[11px] text-red-400/80 border border-red-500/20 rounded-md bg-red-500/5">
            {error}
          </div>
        )}

        <Card className="p-6 mb-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                Model search
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") search();
                }}
                placeholder="e.g. gemma, llama-3, qwen2"
                className="w-full px-3 py-2 text-xs bg-[var(--surface-subtle)] border border-[var(--line)] rounded-md text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/40 hover:border-[var(--line-strong)] transition-all duration-150"
              />
            </div>
            <div className="w-64">
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                HF Token (optional)
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="hf_xxx"
                className="w-full px-3 py-2 text-xs bg-[var(--surface-subtle)] border border-[var(--line)] rounded-md text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/40 hover:border-[var(--line-strong)] transition-all duration-150"
              />
            </div>
            <Button onClick={search} disabled={loading || !query.trim()}>
              {loading ? "Searching..." : "Search"}
            </Button>
          </div>

          <div className="mt-5 space-y-2 max-h-72 overflow-y-auto">
            {hubResults.length === 0 && !loading && (
              <div className="text-[11px] text-[var(--text-tertiary)] text-center py-6">
                Search results will appear here.
              </div>
            )}
            {hubResults.map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 border border-[var(--line)] rounded-md bg-[var(--surface-subtle)] hover:border-[var(--line-strong)] transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-xs text-[var(--text-primary)] truncate font-mono">{model.id}</div>
                  <div className="text-[10px] text-[var(--text-secondary)] mt-0.5 flex flex-wrap gap-x-3">
                    <span>↓ {model.downloads.toLocaleString()}</span>
                    <span>♥ {model.likes.toLocaleString()}</span>
                    {model.sizeBytes !== undefined && model.sizeBytes !== null && (
                      <span className="font-semibold text-[var(--text-primary)]">
                        ◈ {formatBytes(model.sizeBytes)}
                      </span>
                    )}
                    {model.pipeline && <span>{model.pipeline}</span>}
                    {model.lastModified && <span>{model.lastModified.slice(0, 10)}</span>}
                  </div>
                  {model.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {model.tags.slice(0, 6).map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 text-[9px] text-[var(--text-tertiary)] border border-[var(--line)] rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  onClick={() => startDownload(model.id)}
                  disabled={downloading === model.id || model.hasSafetensors === false}
                  variant={model.hasSafetensors === false ? "secondary" : "primary"}
                >
                  {model.hasSafetensors === false
                    ? "No Safetensors"
                    : downloading === model.id
                    ? "Starting..."
                    : "Download"}
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-[var(--text-primary)] tracking-wide uppercase">Active Downloads</h2>
            {activeDownload && (
              <span className="text-[10px] text-[var(--accent-text)] animate-pulse">
                {activeDownload.repoId} • {activeDownload.percent}%
              </span>
            )}
          </div>
          {downloads.length === 0 ? (
            <div className="text-[11px] text-[var(--text-tertiary)] text-center py-6">No downloads yet.</div>
          ) : (
            <div className="space-y-3">
              {downloads.map((dl) => (
                <div
                  key={dl.downloadId}
                  className="px-3 py-2.5 border border-[var(--line)] rounded-md bg-[var(--surface-subtle)]"
                >
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="min-w-0">
                      <div className="text-xs text-[var(--text-primary)] font-mono truncate">{dl.repoId}</div>
                      <div className="text-[10px] text-[var(--text-secondary)]">
                        {formatBytes(dl.downloadedBytes)} / {formatBytes(dl.totalBytes)} • {dl.speedBps.toFixed(0)} B/s
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] px-2 py-0.5 border rounded-full uppercase tracking-wider ${statusStyles[dl.status]}`}
                      >
                        {dl.status}
                      </span>
                      {(dl.status === "running" || dl.status === "queued") && (
                        <Button onClick={() => cancelDownload(dl.downloadId)} variant="danger">
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="h-1 bg-[var(--line)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent)]/60 transition-all duration-300"
                      style={{ width: `${dl.percent}%` }}
                    />
                  </div>
                  {dl.error && (
                    <div className="mt-1.5 text-[10px] text-red-400/80">{dl.error}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card accent className="p-6">
          <h2 className="text-xs font-semibold text-[var(--text-primary)] tracking-wide uppercase mb-4">Local Models</h2>
          {localModels.length === 0 ? (
            <div className="text-[11px] text-[var(--text-tertiary)] text-center py-6">
              No local models detected in base_model/.
            </div>
          ) : (
            <div className="overflow-x-auto border border-[var(--line)] rounded-md bg-[var(--surface-subtle)]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[var(--line)]">
                    <th className="px-4 py-2.5 text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Model</th>
                    <th className="px-4 py-2.5 text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Path</th>
                    <th className="px-4 py-2.5 text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Size</th>
                    <th className="px-4 py-2.5 text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Files</th>
                    <th className="px-4 py-2.5 text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {localModels.map((model) => (
                    <tr
                      key={model.id}
                      className="border-b border-[var(--line-subtle)] hover:bg-[var(--surface)]"
                    >
                      <td className="px-4 py-2.5 text-[11px] text-[var(--text-primary)] font-mono">{model.id}</td>
                      <td className="px-4 py-2.5 text-[11px] text-[var(--text-secondary)] font-mono">{model.localPath}</td>
                      <td className="px-4 py-2.5 text-[11px] text-[var(--text-tertiary)]">{model.sizeGb.toFixed(2)} GB</td>
                      <td className="px-4 py-2.5 text-[11px] text-[var(--text-tertiary)]">{model.fileCount}</td>
                      <td className="px-4 py-2.5 text-[11px]">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => exploreModelFiles(model.id)}
                        >
                          Explore Files
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* File Explorer Modal */}
      {selectedModel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-3xl bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-[var(--line)] flex items-center justify-between bg-[var(--surface-subtle)]">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] font-mono">
                  Model: {selectedModel}
                </h3>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Explore model files and edit configurations</p>
              </div>
              <button
                onClick={() => setSelectedModel(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-full hover:bg-[var(--line)]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {fileError && (
                <div className="mb-4 px-3 py-2 text-[11px] text-red-400/80 border border-red-500/20 rounded-md bg-red-500/5">
                  {fileError}
                </div>
              )}
              {fileSuccess && (
                <div className="mb-4 px-3 py-2 text-[11px] text-emerald-400/80 border border-emerald-500/20 rounded-md bg-emerald-500/5">
                  {fileSuccess}
                </div>
              )}

              {loadingFiles ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-6 h-6 border-2 border-t-[var(--accent)] border-[var(--line)] rounded-full animate-spin" />
                  <span className="text-[10px] text-[var(--text-muted)]">Scanning model folder...</span>
                </div>
              ) : modelFiles.length === 0 ? (
                <div className="text-center py-12 text-[11px] text-[var(--text-tertiary)]">
                  No files found in model folder.
                </div>
              ) : (
                <div className="overflow-x-auto border border-[var(--line)] rounded-lg bg-[var(--surface-subtle)]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[var(--surface-subtle)] border-b border-[var(--line)] text-[var(--text-secondary)] font-mono uppercase text-[9px] tracking-wider">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">File Name</th>
                        <th className="px-4 py-2.5 font-semibold text-right w-32">Size</th>
                        <th className="px-4 py-2.5 font-semibold text-right w-36">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line-subtle)] bg-[var(--surface)]">
                      {modelFiles.map((file) => (
                        <tr key={file.name} className="hover:bg-[var(--surface-subtle)]/50 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--text-primary)] truncate max-w-xs" title={file.name}>
                            {file.name}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--text-tertiary)] text-right">
                            {formatBytes(file.sizeBytes)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {file.isJson ? (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => openJsonFile(selectedModel, file.name)}
                              >
                                Edit JSON
                              </Button>
                            ) : (
                              <span className="text-[10px] text-[var(--text-muted)] border border-[var(--line)] px-2 py-0.5 rounded bg-[var(--surface-subtle)] font-mono select-none">
                                Read-only
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[var(--line)] bg-[var(--surface-subtle)] flex justify-end">
              <Button variant="secondary" onClick={() => setSelectedModel(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* JSON Editor Modal */}
      {editingFile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-4xl bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[85vh]">
            <div className="px-6 py-4 border-b border-[var(--line)] flex items-center justify-between bg-[var(--surface-subtle)]">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] font-mono">
                  Edit: {editingFile}
                </h3>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Model: {selectedModel}</p>
              </div>
              <button
                onClick={() => {
                  setEditingFile(null);
                  setEditingContent("");
                  setFileError(null);
                }}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-full hover:bg-[var(--line)]"
                disabled={savingContent}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4">
              {fileError && (
                <div className="px-3 py-2 text-[11px] text-red-400/80 border border-red-500/20 rounded-md bg-red-500/5">
                  {fileError}
                </div>
              )}
              {fileSuccess && (
                <div className="px-3 py-2 text-[11px] text-emerald-400/80 border border-emerald-500/20 rounded-md bg-emerald-500/5">
                  {fileSuccess}
                </div>
              )}

              {loadingContent ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                  <div className="w-6 h-6 border-2 border-t-[var(--accent)] border-[var(--line)] rounded-full animate-spin" />
                  <span className="text-[10px] text-[var(--text-muted)] font-medium">Loading file content...</span>
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-0">
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5 font-medium">
                    JSON Content
                  </label>
                  <textarea
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    spellCheck={false}
                    className="flex-1 w-full bg-[var(--surface-subtle)] border border-[var(--line)] rounded-lg text-[var(--text-primary)] font-mono text-xs p-4 focus:outline-none focus:border-[var(--accent)]/40 resize-none overflow-y-auto leading-relaxed"
                    placeholder='{ "key": "value" }'
                    disabled={savingContent}
                  />
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-[var(--line)] bg-[var(--surface-subtle)] flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-tertiary)]">
                Only valid JSON is accepted. Parsed on save.
              </span>
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingFile(null);
                    setEditingContent("");
                    setFileError(null);
                  }}
                  disabled={savingContent}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={saveJsonFile}
                  loading={savingContent}
                  disabled={loadingContent}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
