import { CheckCircle, XCircle, Loader2, Circle, TrendingUp, Zap, RefreshCw, Scale, Search, Wand2, AlertTriangle } from "lucide-react";
import type { SSEEvent } from "../types";

interface Props {
  events: SSEEvent[];
  isProcessing: boolean;
}

// ── Icons ────────────────────────────────────────────────────────────────────

function StepIcon({ type, step }: { type: string; step?: string }) {
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
  if (type === "autotune_judge_result")
    return <Scale className="h-4 w-4 shrink-0 text-violet-400" />;
  if (type === "autotune_warning")
    return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />;
  if (type === "autotune_step") {
    if (step === "extracting" || step === "extracted")
      return <Search className="h-4 w-4 shrink-0 text-sky-400" />;
    if (step === "judging")
      return <Scale className="h-4 w-4 shrink-0 animate-pulse text-violet-400" />;
    if (step === "optimizing")
      return <Wand2 className="h-4 w-4 shrink-0 animate-pulse text-indigo-400" />;
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-400" />;
  }
  if (type === "autotune_iteration")
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-400" />;
  if (type === "file_start")
    return <Zap className="h-4 w-4 shrink-0 text-indigo-300" />;
  return <Circle className="h-4 w-4 shrink-0 text-slate-500" />;
}

// ── Accuracy bar ─────────────────────────────────────────────────────────────

function AccuracyBar({ accuracy, threshold }: { accuracy: number; threshold?: number }) {
  const pct = Math.min(accuracy, 100);
  const color = pct >= (threshold ?? 85) ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
  const text  = pct >= (threshold ?? 85) ? "text-emerald-400" : pct >= 60 ? "text-amber-400" : "text-red-400";
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-slate-700">
        <div className={`h-1.5 rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums ${text}`}>{accuracy.toFixed(0)}%</span>
    </div>
  );
}

// ── Iteration badge ───────────────────────────────────────────────────────────

function IterBadge({ iteration, max }: { iteration: number; max?: number }) {
  return (
    <span className="mr-2 inline-flex items-center rounded-full border border-indigo-700 bg-indigo-900/60 px-2 py-0.5 text-[10px] font-bold text-indigo-300 tabular-nums">
      ITER {iteration}{max ? `/${max}` : ""}
    </span>
  );
}

// ── Field score pills ─────────────────────────────────────────────────────────

function FieldScorePills({ correct, incorrect, missing, partial, failedFields }: {
  correct: number; incorrect: number; missing: number; partial: number;
  failedFields?: string[];
}) {
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex flex-wrap gap-1.5">
        {correct   > 0 && <Pill color="emerald" label={`✓ ${correct} correct`} />}
        {partial   > 0 && <Pill color="orange"  label={`~ ${partial} partial`} />}
        {incorrect > 0 && <Pill color="red"     label={`✗ ${incorrect} wrong`} />}
        {missing   > 0 && <Pill color="amber"   label={`∅ ${missing} missing`} />}
      </div>
      {failedFields && failedFields.length > 0 && (
        <p className="text-[11px] text-slate-500">
          Needs fix: {failedFields.map((f) => (
            <span key={f} className="mr-1 rounded bg-slate-800 px-1 py-0.5 font-mono text-[10px] text-slate-400">{f}</span>
          ))}
        </p>
      )}
    </div>
  );
}

function Pill({ color, label }: { color: "emerald" | "red" | "amber" | "orange"; label: string }) {
  const cls: Record<string, string> = {
    emerald: "bg-emerald-900/40 text-emerald-400 border-emerald-800",
    red:     "bg-red-900/40     text-red-400     border-red-800",
    amber:   "bg-amber-900/40   text-amber-400   border-amber-800",
    orange:  "bg-orange-900/40  text-orange-400  border-orange-800",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls[color]}`}>
      {label}
    </span>
  );
}

// ── Prompt length delta ───────────────────────────────────────────────────────

function PromptDelta({ oldLength, newLength }: { oldLength: number; newLength: number }) {
  const delta = newLength - oldLength;
  const sign  = delta > 0 ? "+" : "";
  const color = delta > 0 ? "text-indigo-400" : "text-slate-500";
  return (
    <span className={`ml-2 text-[11px] font-mono ${color}`}>
      ({oldLength} → {newLength} chars, {sign}{delta})
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProcessingPanel({ events, isProcessing }: Props) {
  if (events.length === 0 && !isProcessing) {
    return (
      <div className="flex h-full items-center justify-center text-slate-600">
        <p className="text-sm">Processing steps will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 overflow-y-auto pr-1 scrollbar-thin" style={{ maxHeight: "72vh" }}>
      {events.map((event, idx) => {
        const type  = event.type;
        const step  = (event as any).step as string | undefined;
        const iter  = (event as any).iteration as number | undefined;
        const maxIt = (event as any).max_iterations as number | undefined;

        // Category helpers
        const isFileStart     = type === "file_start";
        const isIterEvent     = type === "autotune_step" || type === "autotune_iteration";
        const isJudgeResult   = type === "autotune_judge_result";
        const isIterComplete  = type === "autotune_iteration_complete";
        const isPromptUpdated = type === "autotune_prompt_updated";
        const isConverged     = type === "autotune_converged";
        const isAutotuneStart = type === "step" && (event as any).step === "autotune";
        const isAutotuneDone  = type === "step_complete" && (event as any).step === "autotune";
        const isError         = type === "step_error" || type === "file_error" || type === "error";
        const isWarning       = type === "autotune_warning";
        const isAllDone       = type === "all_complete";

        const showIterBadge =
          (isIterEvent || isJudgeResult || isIterComplete || isPromptUpdated || isConverged) &&
          iter !== undefined;

        // Visual style per category
        let rowCls = "rounded-lg px-3 py-2.5 text-sm transition-all ";
        if (isFileStart)      rowCls += "mt-4 border border-slate-700 bg-slate-800 font-semibold text-slate-200";
        else if (isAutotuneStart) rowCls += "border border-indigo-800/50 bg-indigo-950/40 text-indigo-300";
        else if (isAutotuneDone)  rowCls += "border border-emerald-800/40 bg-emerald-950/30 text-emerald-300";
        else if (isAllDone)       rowCls += "border border-emerald-700/60 bg-emerald-950/40 text-emerald-200 font-semibold";
        else if (isConverged)     rowCls += "ml-3 border border-indigo-700/40 bg-indigo-950/30";
        else if (isIterComplete)  rowCls += "ml-3 border border-slate-700/60 bg-slate-800/60";
        else if (isJudgeResult)   rowCls += "ml-3 border border-violet-800/40 bg-violet-950/20";
        else if (isPromptUpdated) rowCls += "ml-3 border border-indigo-700/30 bg-indigo-950/20";
        else if (isWarning)       rowCls += "ml-3 border border-amber-800/40 bg-amber-950/20";
        else if (isError)         rowCls += "border border-red-800/40 bg-red-950/20";
        else if (isIterEvent)     rowCls += "ml-3 bg-slate-900/40";
        else                      rowCls += "bg-slate-900/50";

        return (
          <div key={idx} className={rowCls}>
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">
                <StepIcon type={type} step={step} />
              </div>
              <div className="min-w-0 flex-1">
                {/* Iteration badge */}
                {showIterBadge && <IterBadge iteration={iter!} max={maxIt} />}

                {/* Message text */}
                <span className={
                  isError          ? "text-red-300" :
                  isWarning        ? "text-amber-400" :
                  isAutotuneDone   ? "text-slate-200" :
                  isIterComplete   ? "text-slate-200" :
                  isJudgeResult    ? "text-violet-300" :
                  isPromptUpdated  ? "text-indigo-300" :
                  isConverged      ? "text-indigo-300" :
                  isAutotuneStart  ? "text-indigo-300" :
                  isAllDone        ? "text-emerald-200" :
                  isFileStart      ? "text-slate-200" :
                  isIterEvent && step === "extracting" ? "text-sky-400" :
                  isIterEvent && step === "judging"    ? "text-violet-400" :
                  isIterEvent && step === "optimizing" ? "text-indigo-400" :
                  "text-slate-400"
                }>
                  {event.message}
                </span>

                {/* Prompt length delta */}
                {isPromptUpdated &&
                  (event as any).old_length !== undefined &&
                  (event as any).new_length !== undefined && (
                  <PromptDelta
                    oldLength={(event as any).old_length}
                    newLength={(event as any).new_length}
                  />
                )}

                {/* Accuracy bar after iteration complete */}
                {isIterComplete && (event as any).accuracy !== undefined && (
                  <AccuracyBar
                    accuracy={(event as any).accuracy}
                    threshold={(event as any).threshold}
                  />
                )}

                {/* Field score pills after judge result */}
                {isJudgeResult && (
                  <FieldScorePills
                    correct={(event as any).correct ?? 0}
                    incorrect={(event as any).incorrect ?? 0}
                    missing={(event as any).missing ?? 0}
                    partial={(event as any).partial ?? 0}
                    failedFields={(event as any).failed_fields}
                  />
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
