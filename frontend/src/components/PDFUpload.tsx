import { useCallback, useRef, useState } from "react";
import { Upload, FileText, X, Settings, ChevronDown, ChevronUp, FlaskConical } from "lucide-react";

interface Props {
  onProcess: (
    files: File[],
    options: { accuracyThreshold: number; maxIterations: number; customPrompt: string; mockMode: boolean }
  ) => void;
  isProcessing: boolean;
}

export default function PDFUpload({ onProcess, isProcessing }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [accuracyThreshold, setAccuracyThreshold] = useState(85);
  const [maxIterations, setMaxIterations] = useState(3);
  const [customPrompt, setCustomPrompt] = useState("");
  const [mockMode, setMockMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const removeFile = (name: string) =>
    setFiles((prev) => prev.filter((f) => f.name !== name));

  const handleSubmit = () => {
    if ((files.length === 0 && !mockMode) || isProcessing) return;
    // In mock mode allow submitting with a dummy file
    const submitFiles = mockMode && files.length === 0
      ? [new File(["mock"], "mock-document.pdf", { type: "application/pdf" })]
      : files;
    onProcess(submitFiles, { accuracyThreshold, maxIterations, customPrompt, mockMode });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-all ${
          isDragging
            ? "border-indigo-400 bg-indigo-950/40"
            : mockMode
            ? "border-amber-700/60 bg-amber-950/10 hover:border-amber-600"
            : "border-slate-600 bg-slate-900/50 hover:border-indigo-500 hover:bg-slate-900"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <div className={`rounded-full p-4 ${isDragging ? "bg-indigo-500/20" : mockMode ? "bg-amber-900/30" : "bg-slate-800"}`}>
          {mockMode
            ? <FlaskConical className="h-8 w-8 text-amber-400" />
            : <Upload className={`h-8 w-8 ${isDragging ? "text-indigo-400" : "text-slate-400"}`} />}
        </div>
        <div className="text-center">
          {mockMode ? (
            <>
              <p className="font-medium text-amber-300">Mock mode active</p>
              <p className="mt-1 text-sm text-amber-600/80">
                No real PDF needed — uses synthetic data to test the pipeline
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-slate-200">
                Drop PDF files here or <span className="text-indigo-400">browse</span>
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Credit memos, loan agreements, facility letters — any banking document
              </p>
            </>
          )}
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.name}
              className="flex items-center gap-3 rounded-lg bg-slate-800/60 px-4 py-3"
            >
              <FileText className="h-5 w-5 shrink-0 text-indigo-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-200">{file.name}</p>
                <p className="text-xs text-slate-500">{formatSize(file.size)}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeFile(file.name); }}
                className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Settings toggle */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="flex w-full items-center gap-2 rounded-lg bg-slate-800/40 px-4 py-2.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-300 transition-colors"
      >
        <Settings className="h-4 w-4" />
        <span>Extraction settings</span>
        {showSettings ? <ChevronUp className="ml-auto h-4 w-4" /> : <ChevronDown className="ml-auto h-4 w-4" />}
      </button>

      {showSettings && (
        <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">
                Accuracy target (%)
              </label>
              <input
                type="number"
                min={50}
                max={100}
                value={accuracyThreshold}
                onChange={(e) => setAccuracyThreshold(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">
                Max auto-tune iterations
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={maxIterations}
                onChange={(e) => setMaxIterations(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Custom extraction prompt (optional — leave blank to use default)
            </label>
            <textarea
              rows={4}
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Paste a custom Gemini extraction prompt here..."
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none resize-none"
            />
          </div>

          {/* Developer mock toggle */}
          <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-amber-400" />
                <div>
                  <p className="text-xs font-semibold text-amber-300">Developer: Mock Mode</p>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    Skips LLM calls — uses synthetic data to test UI & pipeline flow
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMockMode((m) => !m)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  mockMode ? "bg-amber-500" : "bg-slate-600"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                    mockMode ? "translate-x-4" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            {mockMode && (
              <p className="mt-2 text-[11px] text-amber-500/80">
                ✓ Mock mode ON — simulates 3 iterations with accuracies 62% → 78% → 91%
              </p>
            )}
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={(files.length === 0 && !mockMode) || isProcessing}
        className={`w-full rounded-xl px-6 py-3.5 font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
          mockMode
            ? "bg-amber-600 hover:bg-amber-500 disabled:hover:bg-amber-600"
            : "bg-indigo-600 hover:bg-indigo-500 disabled:hover:bg-indigo-600"
        }`}
      >
        {isProcessing
          ? "Processing…"
          : mockMode
          ? `Run Mock Test (${maxIterations} iteration${maxIterations !== 1 ? "s" : ""})`
          : `Extract from ${files.length} PDF${files.length !== 1 ? "s" : ""}`}
      </button>
    </div>
  );
}
