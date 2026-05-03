"""
Mock responses for developer testing — no LLM calls made.
Each iteration returns slightly improving accuracy to simulate OPRO convergence.
"""
import asyncio

MOCK_EXTRACTION = {
    "loan_amount": "USD 2,500,000",
    "beneficiary_name": "Acme Manufacturing Ltd.",
    "account_number": "1234567890",
    "bank_name": "First National Bank",
    "document_date": "2024-03-15",
    "reference_number": "REF-2024-0315-001",
    "interest_rate": "7.25% per annum",
    "loan_type": "Term Loan",
    "maturity_date": "2029-03-15",
    "credit_limit": "USD 3,000,000",
    "currency": "USD",
    "purpose": "Working capital and equipment purchase",
    "guarantor_name": "John Smith (Director)",
    "collateral": "Factory building at 123 Industrial Park, land title No. LT-44521",
}

# Per-iteration mock judge results — accuracy improves each round
_ITER_MOCKS = [
    {
        "overall_accuracy": 62,
        "overall_feedback": "Several fields missing or partially extracted. Date formats inconsistent, reference number truncated.",
        "improvement_suggestions": [
            "Specify ISO-8601 format for all dates",
            "Look for reference numbers in document header, not footer",
            "Extract full collateral description including land title",
        ],
        "field_scores": {
            "loan_amount":       {"status": "correct",    "comment": ""},
            "beneficiary_name":  {"status": "correct",    "comment": ""},
            "account_number":    {"status": "partial",    "comment": "Missing leading zeros"},
            "bank_name":         {"status": "correct",    "comment": ""},
            "document_date":     {"status": "incorrect",  "comment": "Wrong format: 15/03/2024 vs 2024-03-15"},
            "reference_number":  {"status": "missing",    "comment": "Not found in extracted text"},
            "interest_rate":     {"status": "correct",    "comment": ""},
            "loan_type":         {"status": "correct",    "comment": ""},
            "maturity_date":     {"status": "incorrect",  "comment": "Year off by one: 2028 vs 2029"},
            "credit_limit":      {"status": "missing",    "comment": "Confused with loan_amount"},
            "currency":          {"status": "correct",    "comment": ""},
            "purpose":           {"status": "partial",    "comment": "Only partial description captured"},
            "guarantor_name":    {"status": "missing",    "comment": "Not identified"},
            "collateral":        {"status": "partial",    "comment": "Land title number missing"},
        },
    },
    {
        "overall_accuracy": 78,
        "overall_feedback": "Significant improvement after prompt tuning. Date formatting fixed. A few edge cases remain.",
        "improvement_suggestions": [
            "Distinguish credit_limit from loan_amount — credit_limit is the facility ceiling",
            "Guarantor name appears in signature block, not main body",
        ],
        "field_scores": {
            "loan_amount":       {"status": "correct",    "comment": ""},
            "beneficiary_name":  {"status": "correct",    "comment": ""},
            "account_number":    {"status": "correct",    "comment": ""},
            "bank_name":         {"status": "correct",    "comment": ""},
            "document_date":     {"status": "correct",    "comment": ""},
            "reference_number":  {"status": "correct",    "comment": ""},
            "interest_rate":     {"status": "correct",    "comment": ""},
            "loan_type":         {"status": "correct",    "comment": ""},
            "maturity_date":     {"status": "correct",    "comment": ""},
            "credit_limit":      {"status": "incorrect",  "comment": "Still returning loan_amount value"},
            "currency":          {"status": "correct",    "comment": ""},
            "purpose":           {"status": "correct",    "comment": ""},
            "guarantor_name":    {"status": "missing",    "comment": "Not in body text — check signature block"},
            "collateral":        {"status": "correct",    "comment": ""},
        },
    },
    {
        "overall_accuracy": 91,
        "overall_feedback": "Excellent extraction. All key fields correctly identified. Minor formatting variance in guarantor field.",
        "improvement_suggestions": [],
        "field_scores": {
            "loan_amount":       {"status": "correct",    "comment": ""},
            "beneficiary_name":  {"status": "correct",    "comment": ""},
            "account_number":    {"status": "correct",    "comment": ""},
            "bank_name":         {"status": "correct",    "comment": ""},
            "document_date":     {"status": "correct",    "comment": ""},
            "reference_number":  {"status": "correct",    "comment": ""},
            "interest_rate":     {"status": "correct",    "comment": ""},
            "loan_type":         {"status": "correct",    "comment": ""},
            "maturity_date":     {"status": "correct",    "comment": ""},
            "credit_limit":      {"status": "correct",    "comment": ""},
            "currency":          {"status": "correct",    "comment": ""},
            "purpose":           {"status": "correct",    "comment": ""},
            "guarantor_name":    {"status": "acceptable", "comment": "Title 'Director' included — acceptable"},
            "collateral":        {"status": "correct",    "comment": ""},
        },
    },
]

MOCK_PROMPTS = [
    "Extract banking fields as JSON. Return loan_amount, beneficiary_name, account_number, bank_name, document_date, reference_number, interest_rate, loan_type, maturity_date, credit_limit, currency, purpose, guarantor_name, collateral.",
    "You are a banking analyst. Extract these fields from the document as strict JSON:\n- loan_amount: full amount with currency\n- document_date: ISO-8601 format YYYY-MM-DD\n- reference_number: found in document header\n[...improved prompt v2...]",
    "You are an expert banking analyst. Extract fields with these rules:\n- loan_amount vs credit_limit: credit_limit is the facility ceiling, loan_amount is the drawn amount\n- guarantor_name: check signature blocks and guarantee clauses\n- dates: always ISO-8601\n[...optimized prompt v3...]",
]


async def mock_autotune(
    pdf_data: dict,
    initial_prompt: str,
    accuracy_threshold: float,
    max_iterations: int,
    progress_callback,
) -> dict:
    """Simulates autotune with realistic delays and improving accuracy. No LLM calls."""

    async def emit(event: dict):
        if progress_callback:
            await progress_callback(event)

    iterations = []
    best_result = None
    best_accuracy = -1.0
    current_prompt = initial_prompt

    for i in range(max_iterations):
        iter_num = i + 1
        mock_judge = _ITER_MOCKS[min(i, len(_ITER_MOCKS) - 1)]
        accuracy = float(mock_judge["overall_accuracy"])
        field_scores = mock_judge["field_scores"]

        # ── Step 1: Extraction ────────────────────────────────────────────────
        await emit({
            "type": "autotune_step", "iteration": iter_num, "max_iterations": max_iterations,
            "step": "extracting",
            "message": f"[{iter_num}/{max_iterations}] 🔍 Calling Gemini → extracting {len(MOCK_EXTRACTION)} fields...",
        })
        await asyncio.sleep(0.6)

        await emit({
            "type": "autotune_step", "iteration": iter_num, "max_iterations": max_iterations,
            "step": "extracted",
            "message": f"[{iter_num}/{max_iterations}] ✓ Extraction complete — {len(MOCK_EXTRACTION)} fields returned",
        })
        await asyncio.sleep(0.2)

        # ── Step 2: Judging ───────────────────────────────────────────────────
        await emit({
            "type": "autotune_step", "iteration": iter_num, "max_iterations": max_iterations,
            "step": "judging",
            "message": f"[{iter_num}/{max_iterations}] ⚖️  LLM Judge evaluating field accuracy...",
        })
        await asyncio.sleep(0.8)

        correct   = sum(1 for s in field_scores.values() if s["status"] in ("correct", "acceptable"))
        incorrect = sum(1 for s in field_scores.values() if s["status"] == "incorrect")
        missing   = sum(1 for s in field_scores.values() if s["status"] == "missing")
        partial   = sum(1 for s in field_scores.values() if s["status"] == "partial")
        failed_fields = [f for f, s in field_scores.items() if s["status"] not in ("correct", "acceptable")]

        judge_result = {**mock_judge, "field_scores": field_scores}

        await emit({
            "type": "autotune_judge_result",
            "iteration": iter_num, "max_iterations": max_iterations,
            "accuracy": accuracy,
            "correct": correct, "incorrect": incorrect,
            "missing": missing, "partial": partial,
            "failed_fields": failed_fields,
            "message": (
                f"[{iter_num}/{max_iterations}] Judge: {accuracy:.0f}% — "
                f"✓{correct} correct  ✗{incorrect} wrong  ∅{missing} missing  ~{partial} partial"
            ),
        })

        iteration_record = {
            "iteration": iter_num,
            "prompt": current_prompt,
            "extracted": MOCK_EXTRACTION,
            "judge_result": judge_result,
            "accuracy": accuracy,
        }
        iterations.append(iteration_record)

        if accuracy > best_accuracy:
            best_accuracy = accuracy
            best_result = iteration_record

        await emit({
            "type": "autotune_iteration_complete",
            "iteration": iter_num, "max_iterations": max_iterations,
            "accuracy": accuracy, "threshold": accuracy_threshold,
            "extracted": MOCK_EXTRACTION, "judge_result": judge_result,
            "message": f"Iteration {iter_num}/{max_iterations} complete — accuracy: {accuracy:.0f}% (target: {accuracy_threshold:.0f}%)",
        })

        if accuracy >= accuracy_threshold:
            await emit({
                "type": "autotune_converged",
                "accuracy": accuracy, "iterations": iter_num,
                "message": f"✓ Target {accuracy_threshold:.0f}% reached at {accuracy:.0f}% — continuing remaining iterations to confirm best.",
            })

        # ── Step 3: Prompt optimisation ───────────────────────────────────────
        if i < max_iterations - 1:
            old_len = len(current_prompt)
            await emit({
                "type": "autotune_step", "iteration": iter_num, "max_iterations": max_iterations,
                "step": "optimizing",
                "message": (
                    f"[{iter_num}/{max_iterations}] 🔄 Optimizer LLM rewriting prompt "
                    f"(fixing: {', '.join(failed_fields[:3])}{'…' if len(failed_fields) > 3 else ''})..."
                ),
            })
            await asyncio.sleep(0.7)
            current_prompt = MOCK_PROMPTS[min(i + 1, len(MOCK_PROMPTS) - 1)]
            new_len = len(current_prompt)
            await emit({
                "type": "autotune_prompt_updated",
                "iteration": iter_num, "max_iterations": max_iterations,
                "old_length": old_len, "new_length": new_len,
                "message": f"[{iter_num}/{max_iterations}] ✎ Prompt updated ({old_len} → {new_len} chars) — starting next iteration.",
            })

    return {
        "iterations": iterations,
        "best_result": best_result,
        "best_accuracy": best_accuracy,
        "final_prompt": current_prompt,
        "converged": best_accuracy >= accuracy_threshold,
    }
