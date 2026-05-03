// ── Single-file extraction types ─────────────────────────────────────────────

export interface FieldScore {
  status: "correct" | "incorrect" | "missing" | "acceptable" | "partial";
  extracted_value: string | null;
  correct_value: string | null;
  comment: string;
}

export interface JudgeResult {
  overall_accuracy: number;
  field_scores: Record<string, FieldScore>;
  overall_feedback: string;
  improvement_suggestions: string[];
}

export interface AutotuneIteration {
  iteration: number;
  prompt: string;
  extracted: Record<string, string | null>;
  judge_result: JudgeResult;
  accuracy: number;
}

export interface AutotuneResult {
  iterations: AutotuneIteration[];
  best_result: AutotuneIteration | null;
  best_accuracy: number;
  final_prompt: string;
  converged: boolean;
}

export interface PdfInfo {
  page_count: number;
  is_scanned: boolean;
}

export interface FileResult {
  filename: string;
  pdf_info: PdfInfo;
  initial_extraction: Record<string, string | null>;
  initial_accuracy: number;
  initial_judge: JudgeResult;
  final_extraction: Record<string, string | null>;
  final_accuracy: number;
  autotune: AutotuneResult | null;
}

export type StepStatus = "pending" | "running" | "complete" | "error";

export interface ProcessingStep {
  id: string;
  label: string;
  message: string;
  status: StepStatus;
  data?: unknown;
}

export interface SSEEvent {
  type: string;
  filename?: string;
  file_index?: number;
  total_files?: number;
  step?: string;
  message?: string;
  data?: unknown;
  result?: FileResult;
  results?: FileResult[];
  iteration?: number;
  max_iterations?: number;
  accuracy?: number;
  threshold?: number;
  converged?: boolean;
  extracted?: Record<string, string | null>;
  judge_result?: JudgeResult;
  // autotune_step sub-fields
  step_name?: string;
  // autotune_judge_result sub-fields
  correct?: number;
  incorrect?: number;
  missing?: number;
  partial?: number;
  failed_fields?: string[];
  // autotune_prompt_updated sub-fields
  old_length?: number;
  new_length?: number;
}

// ── Pipeline types ────────────────────────────────────────────────────────────

export interface PipelineSettings {
  extraction_prompt: string | null;
  auto_tune: boolean;
  accuracy_threshold: number;
  max_iterations: number;
}

export interface PipelineFile {
  id: number;
  run_id: string;
  filename: string;
  status: "pending" | "running" | "complete" | "failed";
  accuracy: number | null;
  initial_accuracy: number | null;
  extraction: Record<string, string | null> | null;
  judge_result: JudgeResult | null;
  autotune_iters: Array<{ iteration: number; accuracy: number; judge_result: JudgeResult }> | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface PipelineRun {
  run_id: string;
  created_at: string;
  completed_at: string | null;
  folder_path: string;
  settings: PipelineSettings;
  status: "pending" | "running" | "complete" | "failed";
  total_files: number;
  processed: number;
  succeeded: number;
  failed: number;
  avg_accuracy: number | null;
  files: PipelineFile[];
}

export interface PipelineSSEEvent {
  type: string;
  run_id?: string;
  filename?: string;
  message?: string;
  accuracy?: number;
  extraction?: Record<string, string | null>;
  judge_result?: JudgeResult;
  processed?: number;
  total?: number;
  succeeded?: number;
  failed?: number;
  avg_accuracy?: number | null;
  run?: PipelineRun;
  iteration?: number;
  max_iterations?: number;
  threshold?: number;
}
