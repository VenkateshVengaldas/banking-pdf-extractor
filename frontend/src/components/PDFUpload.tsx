import { useCallback, useRef, useState } from "react";
import { Upload, FileText, X, Settings, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  onProcess: (
    files: File[],
    options: { accuracyThreshold: number; maxIterations: number; customPrompt: string }
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
    if (files.length === 0 || isProcessing) return;
    onProcess(files, { accuracyThreshold, maxIterations, customPrompt });
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
        <div className={`rounded-full p-4 ${isDragging ? "bg-indigo-500/20" : "bg-slate-800"}`}>
          <Upload className={`h-8 w-8 ${isDragging ? "text-indigo-400" : "text-slate-400"}`} />
        </div>
        <div className="text-center">
          <p className="font-medium text-slate-200">
            Drop PDF files here or <span className="text-indigo-400">browse</span>
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Credit memos, loan agreements, facility letters — any banking document
          </p>
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
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={files.length === 0 || isProcessing}
        className="w-full rounded-xl bg-indigo-600 px-6 py-3.5 font-semibold text-white transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-indigo-600"
      >
        {isProcessing
          ? "Processing…"
          : `Extract from ${files.length} PDF${files.length !== 1 ? "s" : ""}`}
      </button>
    </div>
  );
}
