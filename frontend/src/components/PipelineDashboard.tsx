import { useEffect, useState } from "react";
import { RefreshCw, Loader2, CheckCircle, XCircle, Clock, Play, Trash2, Download, Eye } from "lucide-react";
import type { PipelineRun } from "../types";

interface Props {
  runs: PipelineRun[];
  onRefresh: () => void;
  onViewRun: (run: PipelineRun) => void;
  onDeleteRun: (runId: string) => void;
  isLoading: boolean;
}

function RunStatusIcon({ status }: { status: PipelineRun["status"] }) {
  if (status === "complete") return <CheckCircle className="h-4 w-4 text-emerald-400" />;
  if (status === "failed")   return <XCircle className="h-4 w-4 text-red-400" />;
  if (status === "running")  return <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />;
  return <Clock className="h-4 w-4 text-slate-500" />;
}

function accColor(acc: number | null) {
  if (acc == null) return "text-slate-500";
  if (acc >= 85) return "text-emerald-400";
  if (acc >= 65) return "text-amber-400";
  return "text-red-400";
}

function MiniProgress({ run }: { run: PipelineRun }) {
  const pct = run.total_files > 0 ? (run.processed / run.total_files) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-slate-700">
        <div
          className={`h-1.5 rounded-full transition-all ${run.status === "complete" ? "bg-emerald-500" : run.status === "failed" ? "bg-red-500" : "bg-indigo-500"}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 tabular-nums">{run.processed}/{run.total_files}</span>
    </div>
  );
}

export default function PipelineDashboard({ runs, onRefresh, onViewRun, onDeleteRun, isLoading }: Props) {
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (runId: string) => {
    if (!confirm(`Delete run ${runId}? This cannot be undone.`)) return;
    setDeleting(runId);
    try {
      await fetch(`/api/pipeline/runs/${runId}`, { method: "DELETE" });
      onDeleteRun(runId);
    } finally {
      setDeleting(null);
    }
  };

  const totalRuns = runs.length;
  const activeRuns = runs.filter((r) => r.status === "running").length;
  const avgAcc = runs.length
    ? runs.reduce((s, r) => s + (r.avg_accuracy ?? 0), 0) / runs.length
    : null;

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Runs", value: totalRuns, color: "text-slate-100" },
          { label: "Active", value: activeRuns, color: activeRuns > 0 ? "text-indigo-400" : "text-slate-500" },
          { label: "Avg Accuracy", value: avgAcc != null ? `${avgAcc.toFixed(1)}%` : "—",
            color: avgAcc != null ? accColor(avgAcc) : "text-slate-500" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-center">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Header + refresh */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-200">Pipeline Runs</h3>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {runs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 py-16 text-center">
          <Play className="mx-auto mb-3 h-8 w-8 text-slate-700" />
          <p className="text-sm text-slate-500">No pipeline runs yet.</p>
          <p className="mt-1 text-xs text-slate-600">Start a new run to process a batch of PDFs.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-700">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/60">
                  {["Run ID", "Date", "Source", "Files", "Progress", "Accuracy", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.run_id}
                    className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-400">{run.run_id}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {run.created_at.slice(0, 16).replace("T", "\n")}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300 max-w-[160px] truncate">{run.folder_path}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 text-center">{run.total_files}</td>
                    <td className="px-4 py-3"><MiniProgress run={run} /></td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-bold tabular-nums ${accColor(run.avg_accuracy)}`}>
                        {run.avg_accuracy != null ? `${run.avg_accuracy.toFixed(1)}%` : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <RunStatusIcon status={run.status} />
                        <span className="text-xs text-slate-400 capitalize">{run.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onViewRun(run)}
                          title="View detail"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-700 hover:text-slate-200 transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <a
                          href={`/api/pipeline/runs/${run.run_id}/export`}
                          target="_blank"
                          rel="noreferrer"
                          title="Export Excel"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-700 hover:text-emerald-400 transition-colors"
                          onClick={(e) => run.status === "running" && e.preventDefault()}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        <button
                          onClick={() => handleDelete(run.run_id)}
                          disabled={deleting === run.run_id}
                          title="Delete run"
                          className="rounded p-1.5 text-slate-500 hover:bg-red-900/30 hover:text-red-400 transition-colors disabled:opacity-40"
                        >
                          {deleting === run.run_id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
