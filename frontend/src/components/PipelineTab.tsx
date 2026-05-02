import { useCallback, useEffect, useState } from "react";
import { Plus, LayoutDashboard } from "lucide-react";
import PipelineNewRun from "./PipelineNewRun";
import PipelineDashboard from "./PipelineDashboard";
import PipelineRunDetail from "./PipelineRunDetail";
import type { PipelineRun } from "../types";

type View = "dashboard" | "new" | "detail";

export default function PipelineTab() {
  const [view, setView] = useState<View>("dashboard");
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PipelineRun | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchRuns = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/pipeline/runs");
      const data = await res.json();
      setRuns(data);
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  // Auto-refresh while any run is active
  useEffect(() => {
    const hasActive = runs.some((r) => r.status === "running");
    if (!hasActive) return;
    const id = setInterval(fetchRuns, 4000);
    return () => clearInterval(id);
  }, [runs, fetchRuns]);

  const onRunCreated = (run: PipelineRun) => {
    setRuns((prev) => [run, ...prev]);
    setSelectedRun(run);
    setView("detail");
  };

  const onViewRun = (run: PipelineRun) => {
    setSelectedRun(run);
    setView("detail");
  };

  const onRunUpdate = (updated: PipelineRun) => {
    setRuns((prev) => prev.map((r) => (r.run_id === updated.run_id ? updated : r)));
    if (selectedRun?.run_id === updated.run_id) setSelectedRun(updated);
  };

  const onDeleteRun = (runId: string) => {
    setRuns((prev) => prev.filter((r) => r.run_id !== runId));
    if (selectedRun?.run_id === runId) setView("dashboard");
  };

  return (
    <div>
      {/* Sub-nav (only for dashboard/new views) */}
      {view !== "detail" && (
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-200">
            {view === "new" ? "New Pipeline Run" : "Pipeline Dashboard"}
          </h2>
          {view === "dashboard" ? (
            <button
              onClick={() => setView("new")}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
            >
              <Plus className="h-4 w-4" /> New Run
            </button>
          ) : (
            <button
              onClick={() => setView("dashboard")}
              className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </button>
          )}
        </div>
      )}

      {view === "dashboard" && (
        <PipelineDashboard
          runs={runs}
          onRefresh={fetchRuns}
          onViewRun={onViewRun}
          onDeleteRun={onDeleteRun}
          isLoading={isLoading}
        />
      )}

      {view === "new" && (
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <PipelineNewRun onRunCreated={onRunCreated} />
          </div>
        </div>
      )}

      {view === "detail" && selectedRun && (
        <PipelineRunDetail
          run={selectedRun}
          onBack={() => { setView("dashboard"); setSelectedRun(null); }}
          onRunUpdate={onRunUpdate}
        />
      )}
    </div>
  );
}
