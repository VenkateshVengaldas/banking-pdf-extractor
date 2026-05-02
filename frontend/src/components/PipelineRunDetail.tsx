import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, CheckCircle, XCircle, Loader2, Clock,
  Download, TrendingUp, RefreshCw, AlertCircle, Wand2, Copy, Check
} from "lucide-react";
import type { PipelineFile, PipelineRun, PipelineSSEEvent } from "../types";

const FIELD_LABELS: Record<string, string> = {
  loan_amount: "Loan Amount", beneficiary_name: "Beneficiary Name",
  account_number: "Account Number", bank_name: "Bank Name",
  document_date: "Document Date", reference_number: "Reference Number",
  interest_rate: "Interest Rate", loan_type: "Loan Type",
  maturity_date: "Maturity Date", credit_limit: "Credit Limit",
  currency: "Currency", purpose: "Purpose",
  guarantor_name: "Guarantor", collateral: "Collateral",
};

function StatusBadge({ status }: { status: PipelineFile["status"] }) {
  const map = {
    pending: "bg-slate-800 text-slate-400 border-slate-700",
    running: "bg-indigo-900/50 text-indigo-300 border-indigo-700",
    complete: "bg-emerald-900/50 text-emerald-300 border-emerald-800",
    failed: "bg-red-900/50 text-red-300 border-red-800",
  };
  const icons = {
    pending: <Clock className="h-3 w-3" />,
    running: <Loader2 className="h-3 w-3 animate-spin" />,
    complete: <CheckCircle className="h-3 w-3" />,
    failed: <XCircle className="h-3 w-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${map[status]}`}>
      {icons[status]} {status}
    </span>
  );
}

function AccBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = (value / max) * 100;
  const color = value >= 85 ? "bg-emerald-500" : value >= 65 ? "bg-amber-500" : "bg-red-500";
  const text  = value >= 85 ? "text-emerald-400" : value >= 65 ? "text-amber-400" : "text-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-slate-700">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums ${text}`}>{value.toFixed(0)}%</span>
    </div>
  );
}

function IterDots({ iters, best }: { iters: Array<{ accuracy: number }>; best: number }) {
  return (
    <div className="flex items-end gap-1">
      {iters.map((it, i) => {
        const h = Math.max(4, (it.accuracy / 100) * 24);
        const color = it.accuracy >= 85 ? "bg-emerald-500" : it.accuracy >= 65 ? "bg-amber-500" : "bg-red-500";
        const isBest = Math.abs(it.accuracy - best) < 0.5;
        return (
          <div key={i} title={`Iter ${i + 1}: ${it.accuracy.toFixed(0)}%`}
               className={`w-3 rounded-sm ${color} ${isBest ? "ring-1 ring-white/40" : ""}`}
               style={{ height: `${h}px` }} />
        );
      })}
    </div>
  );
}

function FileRow({ file, expanded, onToggle }: {
  file: PipelineFile; expanded: boolean; onToggle: () => void;
}) {
  const acc = file.accuracy;
  const iters = file.autotune_iters || [];

  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-slate-800 hover:bg-slate-800/40 transition-colors"
      >
        <td className="px-4 py-3 text-sm text-slate-200 max-w-[220px] truncate">{file.filename}</td>
        <td className="px-4 py-3"><StatusBadge status={file.status} /></td>
        <td className="px-4 py-3">
          {acc != null ? <AccBar value={acc} /> : <span className="text-xs text-slate-600">—</span>}
        </td>
        <td className="px-4 py-3">
          {iters.length > 0
            ? <IterDots iters={iters} best={acc ?? 0} />
            : <span className="text-xs text-slate-600">—</span>}
        </td>
        <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate">
          {file.error || (file.judge_result?.overall_feedback?.slice(0, 60) + (file.judge_result?.overall_feedback && file.judge_result.overall_feedback.length > 60 ? "…" : "")) || "—"}
        </td>
        <td className="px-4 py-3 text-xs text-slate-600">
          {expanded ? "▲" : "▼"}
        </td>
      </tr>
      {expanded && file.extraction && (
        <tr className="border-b border-slate-800 bg-slate-900/60">
          <td colSpan={6} className="px-4 pb-4 pt-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {Object.entries(FIELD_LABELS).map(([key, label]) => {
                const val = file.extraction?.[key];
                const score = file.judge_result?.field_scores?.[key];
                const statusColor: Record<string, string> = {
                  correct: "border-emerald-700 bg-emerald-900/20",
                  incorrect: "border-red-700 bg-red-900/20",
                  missing: "border-amber-700 bg-amber-900/20",
                  partial: "border-orange-700 bg-orange-900/20",
                  acceptable: "border-slate-700 bg-slate-800/40",
                };
                return (
                  <div key={key} className={`rounded-lg border p-2.5 ${score ? statusColor[score.status] || "border-slate-700" : "border-slate-700 bg-slate-800/20"}`}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="mt-0.5 text-xs text-slate-200 break-words">{val ?? <span className="italic text-slate-600">not found</span>}</p>
                    {score && score.status !== "correct" && score.status !== "acceptable" && (
                      <p className="mt-1 text-[10px] text-slate-500">{score.status}: {score.comment}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

interface Props {
  run: PipelineRun;
  onBack: () => void;
  onRunUpdate: (run: PipelineRun) => void;
}

export default function PipelineRunDetail({ run: initialRun, onBack, onRunUpdate }: Props) {
  const [run, setRun] = useState<PipelineRun>(initialRun);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [liveEvents, setLiveEvents] = useState<string[]>([]);
  const eventsRef = useRef<HTMLDivElement>(null);

  // Best-prompt panel
  const [promptData, setPromptData] = useState<{
    prompt: string; from_file: string; accuracy: number; ready_to_use: object;
  } | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"prompt" | "json" | null>(null);

  const fetchBestPrompt = async () => {
    setPromptLoading(true);
    setPromptError(null);
    try {
      const res = await fetch(`/api/pipeline/runs/${run.run_id}/best-prompt`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to fetch prompt");
      }
      setPromptData(await res.json());
    } catch (e) {
      setPromptError(String(e));
    } finally {
      setPromptLoading(false);
    }
  };

  const copyToClipboard = (text: string, key: "prompt" | "json") => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  // Live SSE subscription while run is active
  useEffect(() => {
    if (run.status === "complete" || run.status === "failed") return;

    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(`/api/pipeline/runs/${run.run_id}/events`, { signal: controller.signal });
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const dec = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const evt: PipelineSSEEvent = JSON.parse(line.slice(6));
              setLiveEvents((prev) => [...prev.slice(-40), evt.message || evt.type]);

              if (evt.type === "file_complete" || evt.type === "file_error" || evt.type === "file_start") {
                // Refresh run data from server
                const r = await fetch(`/api/pipeline/runs/${run.run_id}`);
                const updated = await r.json();
                setRun(updated);
                onRunUpdate(updated);
              }
              if (evt.type === "pipeline_complete" || evt.type === "pipeline_error" || evt.type === "snapshot") {
                const r = await fetch(`/api/pipeline/runs/${run.run_id}`);
                const updated = await r.json();
                setRun(updated);
                onRunUpdate(updated);
              }
            } catch { /* skip */ }
          }
        }
      } catch { /* aborted */ }
    })();

    return () => controller.abort();
  }, [run.run_id]);

  useEffect(() => {
    if (eventsRef.current) eventsRef.current.scrollTop = eventsRef.current.scrollHeight;
  }, [liveEvents]);

  const toggle = (filename: string) =>
    setExpanded((s) => { const n = new Set(s); n.has(filename) ? n.delete(filename) : n.add(filename); return n; });

  const isRunning = run.status === "running";
  const acc = run.avg_accuracy ?? 0;
  const pctDone = run.total_files > 0 ? (run.processed / run.total_files) * 100 : 0;

  const handleExport = () => {
    window.open(`/api/pipeline/runs/${run.run_id}/export`, "_blank");
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </button>
        <div className="flex-1">
          <h2 className="font-bold text-slate-100">
            Run <span className="font-mono text-indigo-400">{run.run_id}</span>
          </h2>
          <p className="text-xs text-slate-500">{run.folder_path} · {run.created_at.slice(0, 19).replace("T", " ")} UTC</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchBestPrompt}
            disabled={isRunning || promptLoading}
            title="Get the best tuned prompt to reuse in future pipeline runs"
            className="flex items-center gap-2 rounded-lg border border-indigo-700 bg-indigo-900/40 px-4 py-2 text-sm text-indigo-300 hover:bg-indigo-900/70 disabled:opacity-40 transition-colors"
          >
            {promptLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Wand2 className="h-4 w-4" />}
            Get Tuned Prompt
          </button>
          <button
            onClick={handleExport}
            disabled={isRunning}
            className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            <Download className="h-4 w-4" /> Export Excel
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: run.total_files, color: "text-slate-100" },
          { label: "Succeeded", value: run.succeeded, color: "text-emerald-400" },
          { label: "Failed", value: run.failed, color: run.failed > 0 ? "text-red-400" : "text-slate-500" },
          { label: "Avg Accuracy", value: `${acc.toFixed(1)}%`, color: acc >= 85 ? "text-emerald-400" : acc >= 65 ? "text-amber-400" : "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 text-center">
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div>
          <div className="mb-1.5 flex justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin text-indigo-400" /> Processing…</span>
            <span>{run.processed} / {run.total_files}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-800">
            <div className="h-2 rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${pctDone}%` }} />
          </div>
        </div>
      )}

      {/* Live events log */}
      {(isRunning || liveEvents.length > 0) && (
        <div ref={eventsRef} className="max-h-32 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-3 scrollbar-thin">
          {liveEvents.map((msg, i) => (
            <p key={i} className="text-xs text-slate-400 leading-5">{msg}</p>
          ))}
          {isRunning && <p className="flex items-center gap-1 text-xs text-indigo-400"><Loader2 className="h-2.5 w-2.5 animate-spin" /> live…</p>}
        </div>
      )}

      {/* Settings info */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-slate-400">
          {run.settings.auto_tune ? "OPRO auto-tune ON" : "Single-pass (pre-tuned prompt)"}
        </span>
        <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-slate-400">
          Target: {run.settings.accuracy_threshold}%
        </span>
        <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-slate-400">
          Max iterations: {run.settings.max_iterations}
        </span>
      </div>

      {/* Tuned Prompt Panel */}
      {promptError && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {promptError}
        </div>
      )}
      {promptData && (
        <div className="rounded-xl border border-indigo-800 bg-indigo-950/30 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-indigo-300 flex items-center gap-2">
                <Wand2 className="h-4 w-4" /> Best Tuned Prompt
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                From: <span className="text-slate-400">{promptData.from_file}</span>
                {" · "}Accuracy: <span className="text-emerald-400 font-bold">{promptData.accuracy?.toFixed(1)}%</span>
              </p>
            </div>
            <button
              onClick={() => setPromptData(null)}
              className="text-slate-600 hover:text-slate-400 text-xs"
            >✕ close</button>
          </div>

          {/* Ready-to-use JSON */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Paste into Pipeline Settings JSON
              </p>
              <button
                onClick={() => copyToClipboard(JSON.stringify(promptData.ready_to_use, null, 2), "json")}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {copied === "json" ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy JSON</>}
              </button>
            </div>
            <pre className="rounded-lg bg-slate-900 border border-slate-700 p-3 text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(promptData.ready_to_use, null, 2)}
            </pre>
          </div>

          {/* Raw prompt */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Raw Prompt Text</p>
              <button
                onClick={() => copyToClipboard(promptData.prompt, "prompt")}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {copied === "prompt" ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy Prompt</>}
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg bg-slate-900 border border-slate-700 p-3 text-xs text-slate-400 whitespace-pre-wrap scrollbar-thin">
              {promptData.prompt}
            </div>
          </div>
        </div>
      )}

      {/* Files table */}
      <div className="overflow-hidden rounded-xl border border-slate-700">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/60">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">File</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Accuracy</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Iters</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {run.files.map((f) => (
                <FileRow key={f.filename} file={f}
                  expanded={expanded.has(f.filename)}
                  onToggle={() => toggle(f.filename)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
