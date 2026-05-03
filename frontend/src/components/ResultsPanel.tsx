import { useState } from "react";
import { CheckCircle, XCircle, AlertCircle, MinusCircle, ChevronDown, ChevronUp, TrendingUp, Wand2, Copy, Check } from "lucide-react";
import type { FileResult, FieldScore, AutotuneIteration } from "../types";

interface Props {
  results: FileResult[];
}

const FIELD_LABELS: Record<string, string> = {
  loan_amount: "Loan Amount",
  beneficiary_name: "Beneficiary Name",
  account_number: "Account Number",
  bank_name: "Bank Name",
  document_date: "Document Date",
  reference_number: "Reference Number",
  interest_rate: "Interest Rate",
  loan_type: "Loan Type",
  maturity_date: "Maturity Date",
  credit_limit: "Credit Limit",
  currency: "Currency",
  purpose: "Purpose",
  guarantor_name: "Guarantor Name",
  collateral: "Collateral",
};

function StatusIcon({ status }: { status: FieldScore["status"] }) {
  switch (status) {
    case "correct":
      return <CheckCircle className="h-4 w-4 text-emerald-400" />;
    case "incorrect":
      return <XCircle className="h-4 w-4 text-red-400" />;
    case "missing":
      return <AlertCircle className="h-4 w-4 text-amber-400" />;
    case "partial":
      return <AlertCircle className="h-4 w-4 text-orange-400" />;
    case "acceptable":
      return <MinusCircle className="h-4 w-4 text-slate-500" />;
    default:
      return null;
  }
}

function statusBadge(status: FieldScore["status"]) {
  const classes: Record<string, string> = {
    correct: "bg-emerald-900/50 text-emerald-300 border-emerald-800",
    incorrect: "bg-red-900/50 text-red-300 border-red-800",
    missing: "bg-amber-900/50 text-amber-300 border-amber-800",
    partial: "bg-orange-900/50 text-orange-300 border-orange-800",
    acceptable: "bg-slate-800 text-slate-400 border-slate-700",
  };
  return classes[status] ?? "bg-slate-800 text-slate-400 border-slate-700";
}

function accuracyRing(accuracy: number) {
  if (accuracy >= 85) return "text-emerald-400 border-emerald-500";
  if (accuracy >= 65) return "text-amber-400 border-amber-500";
  return "text-red-400 border-red-500";
}

function AccuracyGauge({ accuracy }: { accuracy: number }) {
  const color = accuracy >= 85 ? "text-emerald-400" : accuracy >= 65 ? "text-amber-400" : "text-red-400";
  const ring = accuracy >= 85 ? "border-emerald-500" : accuracy >= 65 ? "border-amber-500" : "border-red-500";
  return (
    <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 ${ring}`}>
      <span className={`text-lg font-bold tabular-nums ${color}`}>{accuracy.toFixed(0)}%</span>
    </div>
  );
}

function ExtractionTable({
  extraction,
  fieldScores,
}: {
  extraction: Record<string, string | null>;
  fieldScores?: Record<string, FieldScore>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 bg-slate-800/60">
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 w-36">
              Field
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
              Extracted Value
            </th>
            {fieldScores && (
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 w-28">
                Status
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {Object.entries(FIELD_LABELS).map(([key, label]) => {
            const value = extraction[key];
            const score = fieldScores?.[key];
            return (
              <tr key={key} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-2.5 font-medium text-slate-400 text-xs">{label}</td>
                <td className="px-4 py-2.5">
                  {value != null ? (
                    <span className="text-slate-100">{value}</span>
                  ) : (
                    <span className="text-slate-600 italic">not found</span>
                  )}
                  {score?.comment && score.status !== "correct" && score.status !== "acceptable" && (
                    <p className="mt-0.5 text-xs text-slate-500">{score.comment}</p>
                  )}
                </td>
                {fieldScores && score && (
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge(score.status)}`}
                    >
                      <StatusIcon status={score.status} />
                      {score.status}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AutotuneTimeline({ iterations }: { iterations: AutotuneIteration[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
        <TrendingUp className="h-4 w-4 text-indigo-400" />
        OPRO Optimization Trajectory ({iterations.length} iterations)
      </h4>

      {/* Accuracy chart */}
      <div className="flex items-end gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-4 h-24">
        {iterations.map((it) => {
          const h = Math.max(4, (it.accuracy / 100) * 64);
          const color =
            it.accuracy >= 85 ? "bg-emerald-500" : it.accuracy >= 65 ? "bg-amber-500" : "bg-red-500";
          return (
            <div
              key={it.iteration}
              className="flex flex-1 flex-col items-center gap-1 cursor-pointer"
              onClick={() => setExpanded(expanded === it.iteration ? null : it.iteration)}
              title={`Iteration ${it.iteration}: ${it.accuracy.toFixed(0)}%`}
            >
              <span className="text-xs text-slate-400">{it.accuracy.toFixed(0)}%</span>
              <div
                className={`w-full rounded-t transition-all ${color} ${expanded === it.iteration ? "ring-2 ring-white/30" : ""}`}
                style={{ height: `${h}px` }}
              />
              <span className="text-xs text-slate-600">#{it.iteration}</span>
            </div>
          );
        })}
      </div>

      {/* Expandable iteration details */}
      {iterations.map((it) => (
        <div key={it.iteration} className="rounded-lg border border-slate-700 bg-slate-900">
          <button
            onClick={() => setExpanded(expanded === it.iteration ? null : it.iteration)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <span className="text-xs font-bold text-slate-400">Iter {it.iteration}</span>
            <div className="flex-1">
              <div className="h-1.5 rounded-full bg-slate-700">
                <div
                  className={`h-1.5 rounded-full ${it.accuracy >= 85 ? "bg-emerald-500" : it.accuracy >= 65 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${it.accuracy}%` }}
                />
              </div>
            </div>
            <span className={`text-xs font-bold tabular-nums ${accuracyRing(it.accuracy).split(" ")[0]}`}>
              {it.accuracy.toFixed(0)}%
            </span>
            {expanded === it.iteration ? (
              <ChevronUp className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            )}
          </button>

          {expanded === it.iteration && (
            <div className="border-t border-slate-700 px-4 pb-4 pt-3 space-y-3">
              <p className="text-xs text-slate-400">{it.judge_result.overall_feedback}</p>
              {it.judge_result.improvement_suggestions.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-500">Suggestions used for next prompt:</p>
                  <ul className="space-y-1">
                    {it.judge_result.improvement_suggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-slate-400">
                        <span className="mt-0.5 text-indigo-500">→</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TunedPromptPanel({ finalPrompt, accuracy }: { finalPrompt: string; accuracy: number }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"json" | "prompt" | null>(null);

  const readyJson = JSON.stringify(
    { extraction_prompt: finalPrompt, auto_tune: false, accuracy_threshold: 85, max_iterations: 1 },
    null,
    2
  );

  const copy = (text: string, key: "json" | "prompt") => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="rounded-xl border border-indigo-800/50 bg-indigo-950/20 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-indigo-950/30 transition-colors"
      >
        <Wand2 className="h-4 w-4 text-indigo-400 shrink-0" />
        <div className="flex-1">
          <span className="text-sm font-semibold text-indigo-300">Tuned Prompt — ready to reuse</span>
          <span className="ml-2 text-xs text-indigo-600">
            Best prompt from this run (accuracy: {accuracy.toFixed(0)}%)
          </span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>

      {open && (
        <div className="border-t border-indigo-800/40 px-4 pb-4 pt-3 space-y-3">
          {/* Ready-to-use Pipeline JSON */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Pipeline Settings JSON (paste into New Pipeline Run)
              </p>
              <button
                onClick={() => copy(readyJson, "json")}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {copied === "json"
                  ? <><Check className="h-3.5 w-3.5" /> Copied!</>
                  : <><Copy className="h-3.5 w-3.5" /> Copy JSON</>}
              </button>
            </div>
            <pre className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap">
              {readyJson}
            </pre>
          </div>

          {/* Raw prompt */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Raw Prompt</p>
              <button
                onClick={() => copy(finalPrompt, "prompt")}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {copied === "prompt"
                  ? <><Check className="h-3.5 w-3.5" /> Copied!</>
                  : <><Copy className="h-3.5 w-3.5" /> Copy Prompt</>}
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-400 whitespace-pre-wrap scrollbar-thin">
              {finalPrompt}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FileResultCard({ result }: { result: FileResult }) {
  const [showInitial, setShowInitial] = useState(false);
  const improved = result.autotune !== null;
  const improvement = result.final_accuracy - result.initial_accuracy;

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-slate-700 bg-slate-800/60 px-5 py-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-slate-100">{result.filename}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {result.pdf_info.page_count} page{result.pdf_info.page_count !== 1 ? "s" : ""}
            {" · "}
            {result.pdf_info.is_scanned ? "scanned/image-based" : "text-based"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {improved && (
            <div className="text-center">
              <p className="text-xs text-slate-500">Initial</p>
              <p className="text-sm font-bold text-slate-400">{result.initial_accuracy.toFixed(0)}%</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-xs text-slate-500">{improved ? "Final" : "Accuracy"}</p>
            <AccuracyGauge accuracy={result.final_accuracy} />
          </div>
          {improved && improvement > 0 && (
            <div className="rounded-lg bg-emerald-900/30 border border-emerald-800 px-3 py-1.5 text-center">
              <p className="text-xs text-emerald-400 font-medium">+{improvement.toFixed(0)}%</p>
              <p className="text-xs text-emerald-600">improved</p>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-5 space-y-5">
        {/* Final extraction with judge scores */}
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-300">
            {improved ? "Final Extraction (best result)" : "Extracted Fields"}
          </h4>
          <ExtractionTable
            extraction={result.final_extraction}
            fieldScores={
              improved
                ? result.autotune?.best_result?.judge_result?.field_scores
                : result.initial_judge?.field_scores
            }
          />
        </div>

        {/* Judge feedback */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4">
          <p className="text-xs font-semibold text-slate-400 mb-1">Judge Assessment</p>
          <p className="text-sm text-slate-300">
            {improved
              ? result.autotune?.best_result?.judge_result?.overall_feedback
              : result.initial_judge?.overall_feedback}
          </p>
        </div>

        {/* Auto-tune timeline */}
        {result.autotune && result.autotune.iterations.length > 0 && (
          <AutotuneTimeline iterations={result.autotune.iterations} />
        )}

        {/* Initial extraction comparison */}
        {improved && (
          <div>
            <button
              onClick={() => setShowInitial(!showInitial)}
              className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-400 transition-colors"
            >
              {showInitial ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showInitial ? "Hide" : "Show"} initial extraction (before optimization)
            </button>
            {showInitial && (
              <div className="mt-2">
                <ExtractionTable extraction={result.initial_extraction} />
              </div>
            )}
          </div>
        )}

        {/* Tuned prompt — always shown when autotune ran */}
        {result.autotune?.final_prompt && (
          <TunedPromptPanel
            finalPrompt={result.autotune.final_prompt}
            accuracy={result.final_accuracy}
          />
        )}
      </div>
    </div>
  );
}

export default function ResultsPanel({ results }: Props) {
  if (results.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-slate-600">
        <p className="text-sm">Extraction results will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {results.map((result) => (
        <FileResultCard key={result.filename} result={result} />
      ))}
    </div>
  );
}
