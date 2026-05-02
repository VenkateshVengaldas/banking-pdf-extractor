import { useCallback, useRef, useState } from "react";
import { Upload, FileText, X, Zap, RefreshCw, Info } from "lucide-react";
import type { PipelineRun } from "../types";

const DEFAULT_SETTINGS = JSON.stringify(
  {
    extraction_prompt: null,
    auto_tune: true,
    accuracy_threshold: 85,
    max_iterations: 3,
  },
  null,
  2
);

interface Props {
  onRunCreated: (run: PipelineRun) => void;
}

export default function PipelineNewRun({ onRunCreated }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [settingsJson, setSettingsJson] = useState(DEFAULT_SETTINGS);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [folderLabel, setFolderLabel] = useState("uploaded");
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const pdfs = Array.from(incoming).filter((f) => f.type === "application/pdf");
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...pdfs.filter((f) => !existing.has(f.name))];
    });
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const validateJson = (val: string) => {
    try {
      JSON.parse(val);
      setJsonError(null);
      return true;
    } catch {
      setJsonError("Invalid JSON");
      return false;
    }
  };

  const handleSubmit = async () => {
    if (files.length === 0 || isSubmitting) return;
    if (!validateJson(settingsJson)) return;

    setIsSubmitting(true);
    setError(null);

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    formData.append("settings_json", settingsJson);
    formData.append("folder_label", folderLabel || "uploaded");

    try {
      const res = await fetch("/api/pipeline/runs", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to start pipeline");
      }
      const data = await res.json();
      // Fetch full run object
      const runRes = await fetch(`/api/pipeline/runs/${data.run_id}`);
      const run = await runRes.json();
      onRunCreated(run);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatSize = (b: number) =>
    b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div>
        <p className="mb-2 text-sm font-medium text-slate-300">PDF Files</p>
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 transition-all ${
            isDragging ? "border-indigo-400 bg-indigo-950/40" : "border-slate-600 bg-slate-900/50 hover:border-indigo-500"
          }`}
        >
          <input ref={inputRef} type="file" accept=".pdf" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
          {/* Folder upload support */}
          <input
            ref={folderRef} type="file" multiple hidden
            {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
            onChange={(e) => {
              if (e.target.files) {
                const allFiles = Array.from(e.target.files);
                const dir = allFiles[0]?.webkitRelativePath?.split("/")[0] || "folder";
                setFolderLabel(dir);
                addFiles(allFiles);
              }
            }}
          />
          <Upload className={`h-7 w-7 ${isDragging ? "text-indigo-400" : "text-slate-500"}`} />
          <div className="text-center">
            <p className="text-sm text-slate-300">
              Drop PDFs here, <span className="cursor-pointer text-indigo-400" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>browse files</span>
              {" "}or{" "}
              <span className="cursor-pointer text-indigo-400" onClick={(e) => { e.stopPropagation(); folderRef.current?.click(); }}>select folder</span>
            </p>
            <p className="mt-1 text-xs text-slate-600">All PDFs in the folder will be processed</p>
          </div>
        </div>

        {files.length > 0 && (
          <div className="mt-3 max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin">
            {files.map((f) => (
              <div key={f.name} className="flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-indigo-400" />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{f.name}</span>
                <span className="text-xs text-slate-600">{formatSize(f.size)}</span>
                <button onClick={() => setFiles((p) => p.filter((x) => x.name !== f.name))} className="text-slate-600 hover:text-slate-400">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Folder label */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">Source label</label>
        <input
          value={folderLabel}
          onChange={(e) => setFolderLabel(e.target.value)}
          placeholder="e.g. credit-memos-q1-2024"
          className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* Settings JSON */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-medium text-slate-300">Pipeline settings (JSON)</label>
          <button
            onClick={() => setSettingsJson(DEFAULT_SETTINGS)}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            Reset to default
          </button>
        </div>

        {/* Info box */}
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-slate-700 bg-slate-800/40 p-3 text-xs text-slate-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" />
          <div>
            Set <code className="text-indigo-300">auto_tune: false</code> and paste your tuned prompt in{" "}
            <code className="text-indigo-300">extraction_prompt</code> to run fast single-pass extraction using a pre-optimised prompt.
            Set <code className="text-indigo-300">auto_tune: true</code> to run the full OPRO loop on each file.
          </div>
        </div>

        <textarea
          rows={12}
          value={settingsJson}
          onChange={(e) => { setSettingsJson(e.target.value); validateJson(e.target.value); }}
          spellCheck={false}
          className={`w-full rounded-xl border px-4 py-3 font-mono text-xs text-slate-200 bg-slate-900 focus:outline-none resize-none scrollbar-thin ${
            jsonError ? "border-red-500" : "border-slate-600 focus:border-indigo-500"
          }`}
        />
        {jsonError && <p className="mt-1 text-xs text-red-400">{jsonError}</p>}
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={files.length === 0 || isSubmitting || !!jsonError}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 font-semibold text-white transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isSubmitting ? (
          <><RefreshCw className="h-4 w-4 animate-spin" /> Starting pipeline…</>
        ) : (
          <><Zap className="h-4 w-4" /> Run Pipeline ({files.length} PDF{files.length !== 1 ? "s" : ""})</>
        )}
      </button>
    </div>
  );
}
