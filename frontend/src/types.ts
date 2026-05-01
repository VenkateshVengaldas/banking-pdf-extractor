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
}
