"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Layout from "../../components/Layout";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";

interface ModelOption {
  id: string;
  path: string;
  type: "base" | "export";
}

interface Message {
  role: "user" | "model";
  content: string;
  cot?: string;
}

export default function PlaygroundPage() {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [modelStatus, setModelStatus] = useState<{ status: string; modelPath: string | null; error: string | null }>({
    status: "idle",
    modelPath: null,
    error: null,
  });

  const [loadingModels, setLoadingModels] = useState(true);
  const [statusPolling, setStatusPolling] = useState(true);

  // Generation parameters
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.95);
  const [maxTokens, setMaxTokens] = useState(512);

  // Chat conversation
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [generating, setGenerating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load models
  const fetchModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const [modelsRes, exportsRes] = await Promise.all([
        fetch("/api/models"),
        fetch("/api/exports/files"),
      ]);

      const options: ModelOption[] = [];

      if (modelsRes.ok) {
        const data = await modelsRes.json();
        const baseModels = data.models ?? [];
        baseModels.forEach((m: any) => {
          options.push({
            id: m.id,
            path: m.localPath || `base_model/${m.id}`,
            type: "base",
          });
        });
      }

      if (exportsRes.ok) {
        const data = await exportsRes.json();
        const exportFiles = data.files ?? [];
        exportFiles.forEach((f: any) => {
          options.push({
            id: `Exported: ${f.filename}`,
            path: f.filepath || f.filename,
            type: "export",
          });
        });
      }

      setModels(options);
      if (options.length > 0) {
        setSelectedModel(options[0].path);
      }
    } catch (error) {
      console.error("Failed to load models for playground:", error);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  // Check model status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/playground/status");
      if (res.ok) {
        const data = await res.json();
        setModelStatus(data);
      }
    } catch (error) {
      console.error("Failed to fetch model status:", error);
    }
  }, []);

  useEffect(() => {
    fetchModels();
    fetchStatus();
  }, [fetchStatus, fetchModels]);

  // Poll status while loading
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (statusPolling) {
      interval = setInterval(() => {
        fetchStatus();
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [statusPolling, fetchStatus]);

  // Stop polling if status is ready/idle/error
  useEffect(() => {
    if (modelStatus.status === "loading") {
      setStatusPolling(true);
    } else {
      setStatusPolling(false);
    }
  }, [modelStatus.status]);

  // Load Model
  const handleLoadModel = async () => {
    if (!selectedModel) return;
    try {
      setModelStatus((prev) => ({ ...prev, status: "loading" }));
      const res = await fetch("/api/playground/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelPath: selectedModel }),
      });
      if (!res.ok) throw new Error("Load failed");
      setStatusPolling(true);
    } catch (error) {
      alert("Failed to initiate model load.");
      fetchStatus();
    }
  };

  // Unload Model
  const handleUnloadModel = async () => {
    try {
      const res = await fetch("/api/playground/unload", { method: "POST" });
      if (res.ok) {
        setMessages([]);
        await fetchStatus();
      }
    } catch (error) {
      alert("Failed to unload model.");
    }
  };

  // Helper to parse reasoning out of streamed response
  const parseResponse = (text: string): { cot: string; cleanText: string } => {
    const cotRegex = /<\|channel>thought\n([\s\S]*?)<channel\|>\n?([\s\S]*)/;
    const match = text.match(cotRegex);
    if (match) {
      return {
        cot: match[1].trim(),
        cleanText: match[2],
      };
    }
    
    if (text.includes("<|channel>thought")) {
      const parts = text.split("<|channel>thought\n");
      if (parts.length > 1) {
        const subParts = parts[1].split("<channel|>");
        if (subParts.length > 1) {
          return {
            cot: subParts[0].trim(),
            cleanText: subParts[1].replace(/^\n/, ""),
          };
        } else {
          return {
            cot: subParts[0].trim(),
            cleanText: "",
          };
        }
      }
    }
    return { cot: "", cleanText: text };
  };

  // Send Chat message
  const handleSendMessage = async () => {
    if (!inputValue.trim() || generating || modelStatus.status !== "ready") return;

    const userMessage: Message = { role: "user", content: inputValue.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setGenerating(true);

    const modelMessageIndex = messages.length + 1;
    // Insert placeholder model response
    setMessages((prev) => [...prev, { role: "model", content: "" }]);

    try {
      const response = await fetch("/api/playground/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userMessage.content,
          temperature,
          top_p: topP,
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        throw new Error("Chat inference endpoint failed.");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let rawResponseText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                rawResponseText += data.text;
                
                const { cot, cleanText } = parseResponse(rawResponseText);
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[modelMessageIndex] = {
                    role: "model",
                    content: cleanText,
                    cot: cot || undefined,
                  };
                  return updated;
                });
              } catch (e) {
                // Ignore parse errors on incomplete chunks
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => {
        const updated = [...prev];
        updated[modelMessageIndex] = {
          role: "model",
          content: "Error: Generation was interrupted or failed.",
        };
        return updated;
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-8 py-8 flex flex-col h-[calc(100vh-80px)]">
        <PageHeader
          icon="💬"
          title="Model Playground"
          description="Load models directly in VRAM and test their identity and reasoning trace answers"
        />

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0">
          {/* Settings Sidebar */}
          <div className="lg:col-span-1 flex flex-col gap-4 overflow-y-auto pr-1">
            <Card className="p-4 flex flex-col gap-4 shrink-0">
              <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-bold">Model Setup</h3>
              
              <div>
                <label className="text-[10px] text-[var(--text-secondary)] mb-1 block uppercase tracking-wider">
                  Select Model
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={modelStatus.status === "loading" || modelStatus.status === "ready"}
                  className="w-full bg-[var(--surface-subtle)] border border-[var(--line)] text-[var(--text-primary)] px-2.5 py-1.5 rounded-md text-xs focus:border-[var(--accent)] hover:border-[var(--line-strong)] focus:outline-none transition-colors duration-150 disabled:opacity-50"
                >
                  {loadingModels && <option>Loading models list...</option>}
                  {models.map((m) => (
                    <option key={m.path} value={m.path}>
                      {m.id} ({m.type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                {modelStatus.status === "idle" && (
                  <Button onClick={handleLoadModel} disabled={!selectedModel}>
                    Load Model in VRAM
                  </Button>
                )}
                {modelStatus.status === "loading" && (
                  <Button disabled>
                    <div className="w-3.5 h-3.5 border-2 border-t-[var(--accent)] border-white/20 rounded-full animate-spin mr-2 inline-block align-middle" />
                    Loading Model...
                  </Button>
                )}
                {modelStatus.status === "ready" && (
                  <Button variant="danger" onClick={handleUnloadModel}>
                    Unload Model (Free VRAM)
                  </Button>
                )}
                {modelStatus.status === "error" && (
                  <>
                    <div className="text-[10px] text-red-400 p-2 border border-red-500/20 bg-red-500/5 rounded-md leading-relaxed">
                      <strong>Load Error:</strong> {modelStatus.error}
                    </div>
                    <Button onClick={handleLoadModel}>Try Again</Button>
                    <Button variant="secondary" onClick={handleUnloadModel}>Reset Status</Button>
                  </>
                )}
              </div>

              <div className="border-t border-[var(--line)] pt-3 flex items-center justify-between text-[10px] text-[var(--text-tertiary)] font-mono">
                <span>VRAM Status:</span>
                <span className={`font-semibold ${modelStatus.status === "ready" ? "text-emerald-400" : "text-[var(--text-muted)]"}`}>
                  {modelStatus.status === "ready" ? "Active (4-bit)" : modelStatus.status === "loading" ? "Allocating..." : "Unallocated"}
                </span>
              </div>
            </Card>

            <Card className="p-4 flex flex-col gap-4">
              <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-bold">Parameters</h3>
              
              <div className="space-y-3.5">
                <div>
                  <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mb-1 font-mono">
                    <span>TEMPERATURE</span>
                    <span>{temperature.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="1.5"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-[var(--accent)]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mb-1 font-mono">
                    <span>TOP-P</span>
                    <span>{topP.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={topP}
                    onChange={(e) => setTopP(parseFloat(e.target.value))}
                    className="w-full accent-[var(--accent)]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mb-1 font-mono">
                    <span>MAX NEW TOKENS</span>
                    <span>{maxTokens}</span>
                  </div>
                  <input
                    type="range"
                    min="64"
                    max="2048"
                    step="64"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
                    className="w-full accent-[var(--accent)]"
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* Chat Panel */}
          <div className="lg:col-span-3 flex flex-col bg-[var(--surface-subtle)] border border-[var(--line)] rounded-2xl overflow-hidden min-h-0 relative">
            {modelStatus.status !== "ready" ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[var(--text-tertiary)]">
                <span className="text-4xl mb-4 opacity-50">🤖</span>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Playground Offline</h3>
                <p className="text-xs max-w-sm leading-relaxed mb-4">
                  Please select and load a local model or exported GGUF from the left sidebar to start chatting.
                </p>
              </div>
            ) : (
              <>
                {/* Chat History */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
                  {messages.length === 0 && (
                    <div className="text-center py-16 text-xs text-[var(--text-muted)] italic">
                      Model is loaded and ready. Send a message to begin!
                    </div>
                  )}

                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                    >
                      <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] font-bold mb-1 px-1 font-mono">
                        {msg.role === "user" ? "User" : "m0x model"}
                      </div>
                      
                      <div className="max-w-[85%] space-y-2">
                        {/* Render reasoning block for models */}
                        {msg.role === "model" && msg.cot && (
                          <details open className="group border border-amber-500/20 rounded-xl bg-amber-500/5 overflow-hidden text-xs">
                            <summary className="px-4 py-2 bg-amber-500/10 text-amber-300 font-semibold cursor-pointer select-none flex items-center justify-between hover:bg-amber-500/15 transition-colors">
                              <span className="flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925-3.546 5.974 5.974 0 01-2.133-1A5.978 5.978 0 005.4 6.75a3.75 3.75 0 100 7.5h.008M12 18a3.75 3.75 0 00.495-7.467M12 18v-5.25" />
                                </svg>
                                Thinking Process
                              </span>
                              <span className="text-[10px] text-amber-400 opacity-60 font-mono transition-transform duration-200 group-open:rotate-180">
                                ▼
                              </span>
                            </summary>
                            <div className="px-4 py-3 text-amber-200/80 font-mono whitespace-pre-wrap leading-relaxed text-[11px] border-t border-amber-500/10 max-h-48 overflow-y-auto">
                              {msg.cot}
                            </div>
                          </details>
                        )}

                        <div
                          className={`px-4 py-3 rounded-2xl text-xs leading-relaxed ${
                            msg.role === "user"
                              ? "bg-[var(--accent)] text-white rounded-tr-none"
                              : "bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--line)] rounded-tl-none"
                          }`}
                        >
                          {msg.content === "" ? (
                            <div className="flex items-center gap-1 py-1">
                              <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" />
                              <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:0.2s]" />
                              <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:0.4s]" />
                            </div>
                          ) : (
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-[var(--line)] bg-[var(--surface-subtle)] flex gap-2">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Ask the model anything or test its identity..."
                    disabled={generating}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSendMessage();
                    }}
                    className="flex-1 bg-[var(--surface)] border border-[var(--line)] text-xs text-[var(--text-primary)] px-4 py-3 rounded-xl focus:outline-none focus:border-[var(--accent)] hover:border-[var(--line-strong)] transition-all placeholder-[var(--text-muted)] disabled:opacity-50"
                  />
                  <Button onClick={handleSendMessage} disabled={generating || !inputValue.trim()}>
                    {generating ? "Thinking..." : "Send"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
