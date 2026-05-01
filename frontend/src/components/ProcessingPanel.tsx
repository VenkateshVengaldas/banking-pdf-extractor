import { CheckCircle, XCircle, Loader2, Circle, TrendingUp, Zap, RefreshCw } from "lucide-react";
import type { SSEEvent } from "../types";

interface Props {
  events: SSEEvent[];
  isProcessing: boolean;
}

function StepIcon({ type }: { type: string }) {
  if (type === "step_complete" || type === "file_complete" || type === "all_complete")
    return <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />;
  if (type === "autotune_converged")
    return <CheckCircle className="h-4 w-4 shrink-0 text-indigo-400" />;
  if (type === "step_error" || type === "file_error" || type === "error")
    return <XCircle className="h-4 w-4 shrink-0 text-red-400" />;
  if (type === "autotune_iteration_complete")
    return <TrendingUp className="h-4 w-4 shrink-0 text-amber-400" />;
  if (type === "autotune_prompt_updated")
    return <RefreshCw className="h-4 w-4 shrink-0 text-indigo-400" />;
  if (type === "step" || type === "autotune_iteration" || type === "autotune_warning")
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-400" />;
  if (type === "file_start")
    return <Zap className="h-4 w-4 shrink-0 text-indigo-300" />;
  return <Circle className="h-4 w-4 shrink-0 text-slate-500" />;
}

function accuracyColor(accuracy: number): string {
  if (accuracy >= 85) return "text-emerald-400";
  if (accuracy >= 60) return "text-amber-400";
  return "text-red-400";
}

function AccuracyBar({ accuracy, threshold }: { accuracy: number; threshold?: number }) {
  const pct = Math.min(accuracy, 100);
  const color = pct >= (threshold ?? 85) ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-slate-700">
        <div
          className={`h-1.5 rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-bold tabular-nums ${accuracyColor(accuracy)}`}>
        {accuracy.toFixed(0)}%
      </span>
    </div>
  );
}

function IterationBadge({ iteration, max }: { iteration: number; max?: number }) {
  return (
    <span className="mr-2 inline-flex items-center rounded-full border border-indigo-700 bg-indigo-900/60 px-2 py-0.5 text-[10px] font-bold text-indigo-300 tabular-nums">
      ITER {iteration}{max ? `/${max}` : ""}
    </span>
  );
}

export default function ProcessingPanel({ events, isProcessing }: Props) {
  if (events.length === 0 && !isProcessing) {
    return (
      <div className="flex h-full items-center justify-center text-slate-600">
        <p className="text-sm">Processing steps will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 scrollbar-thin overflow-y-auto pr-1" style={{ maxHeight: "72vh" }}>
      {events.map((event, idx) => {
        const isIterationEvent =
          event.type === "autotune_iteration" ||
          event.type === "autotune_iteration_complete" ||
          event.type === "autotune_prompt_updated" ||
          event.type === "autotune_warning";

        const isIterComplete = event.type === "autotune_iteration_complete";
        const isConverged = event.type === "autotune_converged";
        const isFileStart = event.type === "file_start";
        const isAutotuneStart = event.type === "step" && event.step === "autotune";
        const isAutotuneDone = event.type === "step_complete" && event.step === "autotune";
        const isError = event.type === "step_error" || event.type === "file_error" || event.type === "error";

        return (
          <div
            key={idx}
            className={`rounded-lg px-3 py-2.5 text-sm transition-all ${
              isFileStart
                ? "mt-4 border border-slate-700 bg-slate-800 font-semibold text-slate-200"
                : isAutotuneStart
                ? "border border-indigo-800/50 bg-indigo-950/40 text-indigo-300"
                : isAutotuneDone
                ? "border border-emerald-800/40 bg-emerald-950/30 text-emerald-300"
                : isConverged
                ? "ml-3 border border-indigo-700/40 bg-indigo-950/30"
                : isIterComplete
                ? "ml-3 border border-slate-700/60 bg-slate-800/60"
                : isIterationEvent
                ? "ml-3 bg-slate-900/40"
                : isError
                ? "border border-red-800/40 bg-red-950/20"
                : "bg-slate-900/50"
            }`}
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">
                <StepIcon type={event.type} />
              </div>
              <div className="min-w-0 flex-1">
                {/* Iteration badge for iteration-related events */}
                {isIterationEvent && event.iteration !== undefined && (
                  <IterationBadge iteration={event.iteration} max={event.max_iterations} />
                )}
                {isConverged && event.iteration !== undefined && (
                  <IterationBadge iteration={event.iteration} />
                )}

                <span
                  className={
                    isError
                      ? "text-red-300"
                      : isAutotuneDone || isIterComplete
                      ? "text-slate-200"
                      : isConverged
                      ? "text-indigo-300"
                      : isAutotuneStart
                      ? "text-indigo-300"
                      : "text-slate-400"
                  }
                >
                  {event.message}
                </span>

                {/* Accuracy bar after each iteration */}
                {isIterComplete && event.accuracy !== undefined && (
                  <AccuracyBar accuracy={event.accuracy} threshold={event.threshold} />
                )}
              </div>
            </div>
          </div>
        );
      })}

      {isProcessing && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Processing…</span>
        </div>
      )}
    </div>
  );
}
