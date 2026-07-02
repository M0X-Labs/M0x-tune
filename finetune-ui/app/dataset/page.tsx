"use client";

import React, { useEffect, useState, useCallback } from "react";
import Layout from "../../components/Layout";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import Badge from "../../components/ui/Badge";

interface DatasetFile {
  id: string;
  name: string;
  path: string;
  size_bytes: number;
  rows: number;
  format: string;
  columns: string[];
  uploaded_at: number;
}

interface Dataset {
  id: string;
  name: string;
  files: DatasetFile[];
  total_rows: number;
  created_at: number;
  status?: string | null;
  error?: string | null;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const formatDate = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleString();
};

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newDatasetName, setNewDatasetName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [hubRepoId, setHubRepoId] = useState("");
  const [hubSplitName, setHubSplitName] = useState("");
  const [hubToken, setHubToken] = useState("");
  const [downloadingHub, setDownloadingHub] = useState(false);

  // Preview State
  const [previewFile, setPreviewFile] = useState<{ datasetId: string; fileId: string; fileName: string } | null>(null);
  const [previewData, setPreviewData] = useState<{ columns: string[]; rows: any[] } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Map Columns State
  const [mapFile, setMapFile] = useState<{ datasetId: string; fileId: string; fileName: string; columns: string[] } | null>(null);
  const [selectedInstruction, setSelectedInstruction] = useState("");
  const [selectedOutput, setSelectedOutput] = useState("");
  const [selectedCot, setSelectedCot] = useState("");
  const [mappingInProgress, setMappingInProgress] = useState(false);

  const handleOpenPreview = async (datasetId: string, fileId: string, fileName: string) => {
    setPreviewFile({ datasetId, fileId, fileName });
    setLoadingPreview(true);
    setPreviewData(null);
    try {
      const res = await fetch(`/api/datasets/${datasetId}/files/${fileId}/preview?limit=10`);
      if (!res.ok) throw new Error("Failed to load file preview");
      const data = await res.json();
      setPreviewData(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Preview error");
      setPreviewFile(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleOpenMap = (datasetId: string, file: DatasetFile) => {
    setMapFile({ datasetId, fileId: file.id, fileName: file.name, columns: file.columns });
    const cols = file.columns;
    const instCol = cols.find(c => ["instruction", "prompt", "input", "question", "text", "context"].includes(c.toLowerCase())) || cols[0] || "";
    const outCol = cols.find(c => ["output", "response", "answer", "completion", "target"].includes(c.toLowerCase())) || cols[1] || cols[0] || "";
    const cotCol = cols.find(c => ["cot", "reasoning", "thought", "explanation"].includes(c.toLowerCase())) || "";
    
    setSelectedInstruction(instCol);
    setSelectedOutput(outCol);
    setSelectedCot(cotCol);
  };

  const handleMapColumns = async () => {
    if (!mapFile) return;
    setMappingInProgress(true);
    try {
      const res = await fetch(`/api/datasets/${mapFile.datasetId}/files/${mapFile.fileId}/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          srcInstruction: selectedInstruction,
          srcOutput: selectedOutput,
          srcCot: selectedCot || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Mapping failed");
      }
      setMapFile(null);
      await fetchDatasets();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Column mapping failed");
    } finally {
      setMappingInProgress(false);
    }
  };

  const fetchDatasets = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/datasets/list");
      if (!res.ok) throw new Error("Failed to load datasets");
      const data = (await res.json()) as { datasets: Dataset[] };
      setDatasets(data.datasets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load datasets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  // Automatic poller to refresh downloading datasets status
  useEffect(() => {
    const handle = setInterval(fetchDatasets, 3000);
    return () => clearInterval(handle);
  }, [fetchDatasets]);

  const handleCreateDataset = async () => {
    if (!newDatasetName.trim()) return;
    try {
      const res = await fetch("/api/datasets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDatasetName }),
      });
      if (!res.ok) throw new Error("Failed to create dataset");
      setNewDatasetName("");
      setShowCreateForm(false);
      await fetchDatasets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create dataset");
    }
  };

  const handleDownloadDataset = async () => {
    if (!hubRepoId.trim()) return;
    setDownloadingHub(true);
    setError(null);
    try {
      const res = await fetch("/api/datasets/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoId: hubRepoId,
          splitName: hubSplitName.trim() || undefined,
          token: hubToken.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to start import");
      }
      setHubRepoId("");
      setHubSplitName("");
      setHubToken("");
      await fetchDatasets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start import");
    } finally {
      setDownloadingHub(false);
    }
  };

  const handleFileUpload = async (datasetId: string, file: File) => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("datasetId", datasetId);
      formData.append("file", file);

      const res = await fetch("/api/datasets/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to upload file");
      }

      await fetchDatasets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDataset = async (datasetId: string) => {
    if (!confirm("Are you sure you want to delete this dataset?")) return;
    try {
      const res = await fetch(`/api/datasets/${datasetId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete dataset");
      await fetchDatasets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete dataset");
    }
  };

  const handleDeleteFile = async (datasetId: string, fileId: string) => {
    if (!confirm("Are you sure you want to delete this file?")) return;
    try {
      const res = await fetch(`/api/datasets/${datasetId}/files/${fileId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete file");
      await fetchDatasets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file");
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-8 py-8">
        <PageHeader
          icon="▣"
          title="Datasets"
          description="Upload and manage multiple datasets of any type (JSONL, CSV, Parquet)"
          action={
            <Button onClick={fetchDatasets} disabled={loading}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              Refresh
            </Button>
          }
        />

        {error && (
          <div className="mb-4 p-3 border border-red-500/30 rounded-md bg-red-500/5 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card className="p-5">
            <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-3 block">Create Empty Dataset</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newDatasetName}
                onChange={(e) => setNewDatasetName(e.target.value)}
                placeholder="e.g., coding-tasks, conversations"
                className="flex-1 px-3 py-2 bg-[var(--surface-subtle)] border border-[var(--line)] rounded-md text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/40 hover:border-[var(--line-strong)] transition-all duration-150"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateDataset();
                }}
              />
              <Button onClick={handleCreateDataset} disabled={!newDatasetName.trim()}>
                Create
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-3 block">Import from Hugging Face Hub</h3>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={hubRepoId}
                  onChange={(e) => setHubRepoId(e.target.value)}
                  placeholder="e.g., fka/awesome-chatgpt-prompts"
                  className="flex-1 px-3 py-2 bg-[var(--surface-subtle)] border border-[var(--line)] rounded-md text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/40 hover:border-[var(--line-strong)] transition-all duration-150"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleDownloadDataset();
                  }}
                />
                <Button onClick={handleDownloadDataset} disabled={downloadingHub || !hubRepoId.trim()}>
                  {downloadingHub ? "Importing..." : "Import"}
                </Button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={hubSplitName}
                  onChange={(e) => setHubSplitName(e.target.value)}
                  placeholder="split (default: train)"
                  className="w-32 px-3 py-1.5 bg-[var(--surface-subtle)] border border-[var(--line)] rounded-md text-[10px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/40 hover:border-[var(--line-strong)] transition-all duration-150"
                />
                <input
                  type="password"
                  value={hubToken}
                  onChange={(e) => setHubToken(e.target.value)}
                  placeholder="HF Token (optional)"
                  className="flex-1 px-3 py-1.5 bg-[var(--surface-subtle)] border border-[var(--line)] rounded-md text-[10px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/40 hover:border-[var(--line-strong)] transition-all duration-150"
                />
              </div>
            </div>
          </Card>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-4 h-4 border border-white/10 border-t-[var(--accent)]/60 rounded-full animate-spin" />
          </div>
        ) : datasets.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="text-[10px] text-[var(--text-tertiary)] tracking-wide">
              No datasets yet. Create one above to get started.
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {datasets.map((dataset) => (
              <Card key={dataset.id} className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base text-[var(--text-primary)] font-medium">{dataset.name}</h3>
                    <div className="text-[10px] text-[var(--text-tertiary)] mt-1">
                      {dataset.total_rows} total rows · Created {formatDate(dataset.created_at)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".jsonl,.json,.csv,.parquet"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(dataset.id, file);
                          e.currentTarget.value = "";
                        }}
                      />
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent-subtle)] text-[var(--accent-text)] border border-[var(--accent)]/30 rounded-md text-xs font-medium hover:bg-[var(--accent-dim)] transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        Upload File
                      </span>
                    </label>
                    <Button
                      variant="danger"
                      onClick={() => handleDeleteDataset(dataset.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                {dataset.error && (
                  <div className="mb-3 px-3 py-2 text-xs text-red-400 border border-red-500/20 rounded-md bg-red-500/5">
                    <span className="font-semibold block uppercase text-[9px] tracking-wider text-red-300 mb-1">Import failed</span>
                    {dataset.error}
                  </div>
                )}

                {dataset.files.length === 0 ? (
                  dataset.status === "downloading" ? (
                    <div className="text-[10px] text-[var(--text-tertiary)] py-6 text-center border border-dashed border-[var(--line)] rounded-md flex flex-col items-center justify-center gap-2 bg-[var(--surface-subtle)]">
                      <div className="w-4 h-4 border-2 border-t-[var(--accent)] border-[var(--line)] rounded-full animate-spin" />
                      <div>Downloading and parsing dataset from Hugging Face Hub...</div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-[var(--text-tertiary)] py-4 text-center border border-dashed border-[var(--line)] rounded-md">
                      No files uploaded yet. Click "Upload File" to add JSONL, CSV, or Parquet files.
                    </div>
                  )
                ) : (
                  <div className="space-y-2">
                    {dataset.files.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-3 border border-[var(--line)] rounded-md bg-[var(--surface-subtle)]"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-[var(--text-primary)] font-mono">{file.name}</span>
                            <Badge>{file.format}</Badge>
                          </div>
                          <div className="text-[10px] text-[var(--text-tertiary)] mt-1">
                            {file.rows} rows · {formatBytes(file.size_bytes)} ·{" "}
                            {file.columns.length} columns ({file.columns.join(", ")})
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <Button
                            variant="secondary"
                            onClick={() => handleOpenPreview(dataset.id, file.id, file.name)}
                          >
                            Preview
                          </Button>
                          {file.columns && file.columns.length > 0 && (
                            <Button
                              variant="secondary"
                              onClick={() => handleOpenMap(dataset.id, file)}
                            >
                              Map Columns
                            </Button>
                          )}
                          <Button
                            variant="danger"
                            onClick={() => handleDeleteFile(dataset.id, file.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {uploading && (
          <div className="mt-4 text-[10px] text-[var(--text-muted)] text-center">
            Uploading...
          </div>
        )}

        {/* Preview Modal */}
        {previewFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-4xl bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
              <div className="px-6 py-4 border-b border-[var(--line)] flex items-center justify-between bg-[var(--surface-subtle)]">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Preview: {previewFile.fileName}</h3>
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 font-mono">Showing first 10 rows</p>
                </div>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-full hover:bg-[var(--line)]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-auto p-5">
                {loadingPreview ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <div className="w-6 h-6 border-2 border-t-[var(--accent)] border-[var(--line)] rounded-full animate-spin" />
                    <span className="text-[10px] text-[var(--text-muted)] font-medium">Loading preview rows...</span>
                  </div>
                ) : previewData ? (
                  <div className="overflow-x-auto border border-[var(--line)] rounded-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[var(--surface-subtle)] border-b border-[var(--line)] text-[var(--text-secondary)] font-mono uppercase text-[9px] tracking-wider">
                        <tr>
                          {previewData.columns.map((col) => (
                            <th key={col} className="px-4 py-3 font-semibold border-r border-[var(--line)] last:border-r-0">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--line)] text-[var(--text-primary)] font-mono text-[11px]">
                        {previewData.rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-[var(--surface-subtle)]/50 transition-colors">
                            {previewData.columns.map((col) => {
                              const val = row[col];
                              let text = "";
                              if (typeof val === "object" && val !== null) {
                                text = JSON.stringify(val);
                              } else {
                                text = String(val ?? "");
                              }
                              return (
                                <td key={col} className="px-4 py-3 border-r border-[var(--line)] last:border-r-0 max-w-xs truncate" title={text}>
                                  {text}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-xs text-[var(--text-muted)]">No preview data found.</div>
                )}
              </div>
              <div className="px-6 py-4 bg-[var(--surface-subtle)] border-t border-[var(--line)] flex justify-end">
                <Button onClick={() => setPreviewFile(null)}>Close Preview</Button>
              </div>
            </div>
          </div>
        )}

        {/* Map Columns Modal */}
        {mapFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-[var(--line)] flex items-center justify-between bg-[var(--surface-subtle)]">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Map Columns</h3>
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{mapFile.fileName}</p>
                </div>
                <button
                  onClick={() => setMapFile(null)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-full hover:bg-[var(--line)]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider mb-1.5 block">
                    Instruction / Input Column
                  </label>
                  <select
                    value={selectedInstruction}
                    onChange={(e) => setSelectedInstruction(e.target.value)}
                    className="w-full bg-[var(--surface-subtle)] border border-[var(--line)] text-[var(--text-primary)] px-3 py-2 rounded-md text-xs focus:border-[var(--accent)] hover:border-[var(--line-strong)] focus:outline-none transition-colors"
                  >
                    <option value="">-- Select Column --</option>
                    {mapFile.columns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider mb-1.5 block">
                    Target Output Column
                  </label>
                  <select
                    value={selectedOutput}
                    onChange={(e) => setSelectedOutput(e.target.value)}
                    className="w-full bg-[var(--surface-subtle)] border border-[var(--line)] text-[var(--text-primary)] px-3 py-2 rounded-md text-xs focus:border-[var(--accent)] hover:border-[var(--line-strong)] focus:outline-none transition-colors"
                  >
                    <option value="">-- Select Column --</option>
                    {mapFile.columns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider mb-1.5 block">
                    Reasoning / CoT Column (Optional)
                  </label>
                  <select
                    value={selectedCot}
                    onChange={(e) => setSelectedCot(e.target.value)}
                    className="w-full bg-[var(--surface-subtle)] border border-[var(--line)] text-[var(--text-primary)] px-3 py-2 rounded-md text-xs focus:border-[var(--accent)] hover:border-[var(--line-strong)] focus:outline-none transition-colors"
                  >
                    <option value="">-- None (No CoT mapping) --</option>
                    {mapFile.columns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  <p className="text-[9px] text-[var(--text-tertiary)] mt-1.5 leading-relaxed">
                    Selecting a reasoning column embeds step-by-step thinking traces inside the trained model.
                  </p>
                </div>
              </div>
              <div className="px-6 py-4 bg-[var(--surface-subtle)] border-t border-[var(--line)] flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setMapFile(null)} disabled={mappingInProgress}>
                  Cancel
                </Button>
                <Button onClick={handleMapColumns} disabled={mappingInProgress || !selectedInstruction || !selectedOutput}>
                  {mappingInProgress ? "Mapping Columns..." : "Generate Clean Dataset"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
