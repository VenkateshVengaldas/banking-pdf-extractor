import { useState, useCallback } from "react";
import { Building2, Activity, FileSearch, Layers } from "lucide-react";
import PDFUpload from "./components/PDFUpload";
import ProcessingPanel from "./components/ProcessingPanel";
import ResultsPanel from "./components/ResultsPanel";
import PipelineTab from "./components/PipelineTab";
import type { SSEEvent, FileResult } from "./types";

type Tab = "upload" | "processing" | "results" | "pipeline";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [isProcessing, setIsProcessing] = useState(false);
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [results, setResults] = useState<FileResult[]>([]);

  const handleProcess = useCallback(
    async (
      files: File[],
      options: { accuracyThreshold: number; maxIterations: number; customPrompt: string; mockMode: boolean }
    ) => {
      setIsProcessing(true);
      setEvents([]);
      setResults([]);
      setActiveTab("processing");

      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      formData.append("accuracy_threshold", String(options.accuracyThreshold));
      formData.append("max_iterations", String(options.maxIterations));
      if (options.customPrompt) {
        formData.append("custom_prompt", options.customPrompt);
      }
      if (options.mockMode) {
        formData.append("mock_mode", "true");
      }

      try {
        const response = await fetch("/api/process", {
          method: "POST",
          body: formData,
        });

        if (!response.ok || !response.body) {
          setEvents((prev) => [
            ...prev,
            { type: "error", message: `Server error: ${response.status} ${response.statusText}` },
          ]);
          setIsProcessing(false);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event: SSEEvent = JSON.parse(line.slice(6));
              setEvents((prev) => [...prev, event]);

              if (event.type === "file_complete" && event.result) {
                setResults((prev) => [...prev, event.result as FileResult]);
              }
              if (event.type === "all_complete") {
                setIsProcessing(false);
                setActiveTab("results");
              }
              if (event.type === "error") {
                setIsProcessing(false);
              }
            } catch {
              // skip malformed SSE line
            }
          }
        }
      } catch (err) {
        setEvents((prev) => [
          ...prev,
          { type: "error", message: String(err) },
        ]);
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "upload", label: "Upload", icon: <FileSearch className="h-4 w-4" /> },
    {
      id: "processing",
      label: "Processing",
      icon: <Activity className="h-4 w-4" />,
      badge: isProcessing ? events.length : undefined,
    },
    {
      id: "results",
      label: "Results",
      icon: <Building2 className="h-4 w-4" />,
      badge: results.length > 0 ? results.length : undefined,
    },
    { id: "pipeline", label: "Pipeline", icon: <Layers className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Top bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-slate-100 leading-none">Banking PDF Extractor</h1>
              <p className="text-xs text-slate-500 mt-0.5">Gemini · LLM-as-Judge · OPRO Auto-tune</p>
            </div>
          </div>

          {/* Tab nav */}
          <nav className="ml-auto flex items-center gap-1 rounded-xl bg-slate-800 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.badge !== undefined && (
                  <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        {activeTab === "upload" && (
          <div className="mx-auto max-w-2xl">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-slate-100">Extract Financial Data from PDFs</h2>
              <p className="mt-2 text-slate-400">
                Upload banking documents — credit memos, loan agreements, facility letters — and let
                Gemini extract structured fields with automatic accuracy optimization.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
              <PDFUpload onProcess={handleProcess} isProcessing={isProcessing} />
            </div>

            {/* Feature cards */}
            <div className="mt-6 grid grid-cols-3 gap-4">
              {[
                {
                  icon: "🔍",
                  title: "Gemini Extraction",
                  desc: "Gemini 1.5 Pro reads native text and scanned documents via vision",
                },
                {
                  icon: "⚖️",
                  title: "LLM-as-Judge",
                  desc: "A second Gemini instance independently verifies each extracted field",
                },
                {
                  icon: "🔄",
                  title: "OPRO Auto-tune",
                  desc: "Judge feedback drives iterative prompt optimization until accuracy target is met",
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-center"
                >
                  <div className="mb-2 text-2xl">{card.icon}</div>
                  <h3 className="mb-1 text-sm font-semibold text-slate-200">{card.title}</h3>
                  <p className="text-xs text-slate-500">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "processing" && (
          <div className="mx-auto max-w-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-200">Processing Pipeline</h2>
              {isProcessing && (
                <span className="flex items-center gap-1.5 rounded-full bg-indigo-900/50 border border-indigo-700 px-3 py-1 text-xs text-indigo-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
              <ProcessingPanel events={events} isProcessing={isProcessing} />
            </div>
          </div>
        )}

        {activeTab === "pipeline" && <PipelineTab />}

        {activeTab === "results" && (
          <div>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-200">
                Extraction Results{results.length > 0 && ` — ${results.length} document${results.length !== 1 ? "s" : ""}`}
              </h2>
              {results.length > 0 && (
                <button
                  onClick={() => {
                    setActiveTab("upload");
                    setResults([]);
                    setEvents([]);
                  }}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Process new files
                </button>
              )}
            </div>
            <ResultsPanel results={results} />
          </div>
        )}
      </main>
    </div>
  );
}
