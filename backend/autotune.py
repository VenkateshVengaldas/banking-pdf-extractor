"""
Auto-tuning module — inspired by OPRO (Optimization by PROmpting).

Treats the extraction prompt as a "parameter" to optimize:
  - Accuracy score   → objective / loss signal
  - Judge feedback   → gradient signal
  - Optimizer LLM    → gradient-descent step (generates improved prompt)
  - Iterations       → training steps

Reference: "Large Language Models as Optimizers" (Yang et al., 2023)
Karpathy framing: using the LLM as its own optimizer, similar to how
a neural net uses backprop — the feedback signal flows back to update
the "parameter" (prompt) that controls the model's behavior.
"""

import json
from typing import Callable, Optional

from extractor import extract_fields
from judge import judge_extraction

OPTIMIZER_SYSTEM_PROMPT = """You are an elite prompt engineer specializing in financial document extraction systems. You optimize extraction prompts using principles from automatic prompt optimization research (OPRO/APE).

Your task: given a failing extraction prompt and the judge's detailed feedback, produce an improved prompt that fixes the identified issues.

Optimization principles to apply:
1. **Precision over brevity** — add explicit rules for fields that were extracted incorrectly
2. **Format anchoring** — specify exact expected formats for amounts, dates, and IDs
3. **Negative examples** — add "do NOT" rules for common failure patterns observed
4. **Structural hints** — guide the model to look in specific document sections (headers, tables, signature blocks)
5. **Field disambiguation** — clarify fields that are commonly confused (e.g., loan_amount vs credit_limit)
6. **Chain-of-thought cues** — instruct the model to reason about each field before extracting (for complex docs)

The improved prompt MUST:
- Still produce a valid JSON response with the same field names
- Address EVERY specific issue raised in the judge's feedback
- Be no more than 50% longer than the original prompt (avoid prompt bloat)
- Include concrete formatting examples for any fields that were wrong

Return ONLY the raw improved prompt text — no markdown, no preamble, no explanation.
"""


def _build_optimizer_input(
    current_prompt: str,
    extracted: dict,
    judge_result: dict,
    iteration: int,
    history: list,
) -> str:
    accuracy = judge_result.get("overall_accuracy", 0)
    feedback = judge_result.get("overall_feedback", "")
    suggestions = judge_result.get("improvement_suggestions", [])
    field_scores = judge_result.get("field_scores", {})

    problem_lines = []
    for field, score in field_scores.items():
        status = score.get("status", "")
        if status in ("incorrect", "missing", "partial"):
            extracted_val = score.get("extracted_value")
            correct_val = score.get("correct_value")
            comment = score.get("comment", "")
            problem_lines.append(
                f"  [{status.upper()}] {field}:\n"
                f"    Extracted: {extracted_val}\n"
                f"    Should be: {correct_val}\n"
                f"    Issue: {comment}"
            )

    history_summary = ""
    if len(history) > 1:
        acc_history = [f"iter {h['iteration']}: {h['accuracy']:.0f}%" for h in history[:-1]]
        history_summary = f"\nAccuracy trajectory so far: {' → '.join(acc_history)}\n"

    suggestions_text = "\n".join(f"  - {s}" for s in suggestions)

    return f"""{OPTIMIZER_SYSTEM_PROMPT}

--- OPTIMIZATION CONTEXT ---
Iteration: {iteration}
Current accuracy: {accuracy}%
{history_summary}
--- CURRENT PROMPT (to improve) ---
{current_prompt}

--- JUDGE'S ASSESSMENT ---
Overall: {feedback}

Problematic fields:
{chr(10).join(problem_lines) if problem_lines else "  (none identified)"}

Improvement suggestions from judge:
{suggestions_text if suggestions_text else "  (none provided)"}

--- PRODUCE IMPROVED PROMPT BELOW ---"""


async def autotune(
    client,
    model_name: str,
    pdf_data: dict,
    initial_prompt: str,
    accuracy_threshold: float = 85.0,
    max_iterations: int = 3,
    progress_callback: Optional[Callable] = None,
) -> dict:
    current_prompt = initial_prompt
    iterations = []
    best_result = None
    best_accuracy = -1.0

    async def emit(event: dict):
        if progress_callback:
            await progress_callback(event)

    for i in range(max_iterations):
        iter_num = i + 1

        await emit({
            "type": "autotune_iteration",
            "iteration": iter_num,
            "max_iterations": max_iterations,
            "message": f"Auto-tune iteration {iter_num}/{max_iterations} — extracting...",
        })

        # --- Extract ---
        try:
            extracted = extract_fields(client, model_name, pdf_data, current_prompt)
        except Exception as e:
            extracted = {}
            await emit({"type": "autotune_warning", "iteration": iter_num,
                         "message": f"Extraction error: {e}"})

        # --- Judge ---
        await emit({
            "type": "autotune_iteration",
            "iteration": iter_num,
            "message": f"Auto-tune iteration {iter_num}/{max_iterations} — judging accuracy...",
        })

        try:
            judge_result = judge_extraction(client, model_name, pdf_data, extracted)
        except Exception as e:
            judge_result = {
                "overall_accuracy": 0,
                "field_scores": {},
                "overall_feedback": str(e),
                "improvement_suggestions": [],
            }
            await emit({"type": "autotune_warning", "iteration": iter_num,
                         "message": f"Judge error: {e}"})

        accuracy = float(judge_result.get("overall_accuracy", 0))

        iteration_record = {
            "iteration": iter_num,
            "prompt": current_prompt,
            "extracted": extracted,
            "judge_result": judge_result,
            "accuracy": accuracy,
        }
        iterations.append(iteration_record)

        if accuracy > best_accuracy:
            best_accuracy = accuracy
            best_result = iteration_record

        await emit({
            "type": "autotune_iteration_complete",
            "iteration": iter_num,
            "accuracy": accuracy,
            "threshold": accuracy_threshold,
            "extracted": extracted,
            "judge_result": judge_result,
            "message": f"Iteration {iter_num} — accuracy: {accuracy:.0f}% (target: {accuracy_threshold:.0f}%)",
        })

        converged_early = accuracy >= accuracy_threshold
        if converged_early:
            await emit({
                "type": "autotune_converged",
                "accuracy": accuracy,
                "iterations": iter_num,
                "message": f"Target reached at {accuracy:.0f}% — continuing remaining iterations to confirm best result.",
            })

        # Always generate improved prompt (except after the last iteration)
        if i < max_iterations - 1:
            await emit({
                "type": "autotune_iteration",
                "iteration": iter_num,
                "message": f"Accuracy {accuracy:.0f}% < {accuracy_threshold:.0f}% — generating improved prompt...",
            })

            try:
                optimizer_input = _build_optimizer_input(
                    current_prompt, extracted, judge_result, iter_num, iterations
                )
                response = client.models.generate_content(model=model_name, contents=optimizer_input)
                improved = response.text.strip()
                if improved:
                    current_prompt = improved
                    await emit({
                        "type": "autotune_prompt_updated",
                        "iteration": iter_num,
                        "message": "Prompt updated — starting next iteration.",
                    })
            except Exception as e:
                await emit({"type": "autotune_warning", "iteration": iter_num,
                             "message": f"Optimizer error: {e} — keeping current prompt."})

    return {
        "iterations": iterations,
        "best_result": best_result,
        "best_accuracy": best_accuracy,
        "final_prompt": current_prompt,
        "converged": best_accuracy >= accuracy_threshold,
    }
