"""
Pipeline processor — scans a folder for PDFs and runs the
extract → judge → (optional OPRO autotune) cycle for each file.

If settings["auto_tune"] is False and an extraction_prompt is provided,
runs a single-pass extraction using that prompt (no judge/optimizer).
This is the fast "production" mode after prompts have been tuned.
"""
import asyncio
import glob
import os
import tempfile
from pathlib import Path
from typing import Callable, Optional

import pipeline_store as store
from autotune import autotune
from extractor import build_extraction_prompt, extract_fields
from judge import judge_extraction
from pdf_processor import extract_text_from_pdf


async def _emit(callback: Optional[Callable], event: dict) -> None:
    if callback:
        await callback(event)


async def process_file(
    client,
    model_name: str,
    run_id: str,
    filename: str,
    pdf_bytes: bytes,
    settings: dict,
    event_callback: Optional[Callable] = None,
) -> dict:
    """Process a single PDF file through the pipeline."""

    auto_tune: bool = settings.get("auto_tune", True)
    accuracy_threshold: float = float(settings.get("accuracy_threshold", 85))
    max_iterations: int = int(settings.get("max_iterations", 3))
    custom_prompt: Optional[str] = settings.get("extraction_prompt") or None

    store.update_file(run_id, filename, status="running", started_at=store._now())

    await _emit(event_callback, {
        "type": "file_start", "run_id": run_id, "filename": filename,
        "message": f"Starting: {filename}",
    })

    # ── Write to temp file ────────────────────────────────────────────────────
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name

    try:
        # ── PDF parsing ───────────────────────────────────────────────────────
        await _emit(event_callback, {
            "type": "file_step", "run_id": run_id, "filename": filename,
            "step": "pdf_extraction", "message": "Extracting PDF content…",
        })
        pdf_data = extract_text_from_pdf(tmp_path)

        initial_prompt = build_extraction_prompt(custom_prompt)

        # ── FAST MODE: single-pass, no judge, no optimizer ────────────────────
        if not auto_tune and custom_prompt:
            await _emit(event_callback, {
                "type": "file_step", "run_id": run_id, "filename": filename,
                "step": "extraction", "message": "Single-pass extraction (pre-tuned prompt)…",
            })
            extracted = extract_fields(client, model_name, pdf_data, initial_prompt)

            await _emit(event_callback, {
                "type": "file_step", "run_id": run_id, "filename": filename,
                "step": "judging", "message": "Judging accuracy…",
            })
            judge_result = judge_extraction(client, model_name, pdf_data, extracted)
            accuracy = float(judge_result.get("overall_accuracy", 0))

            store.update_file(
                run_id, filename,
                status="complete", accuracy=accuracy, initial_accuracy=accuracy,
                extraction=extracted, judge_result=judge_result,
                completed_at=store._now(),
            )
            await _emit(event_callback, {
                "type": "file_complete", "run_id": run_id, "filename": filename,
                "accuracy": accuracy, "extraction": extracted,
                "message": f"Done — accuracy: {accuracy:.0f}%",
            })
            return {"filename": filename, "status": "complete", "accuracy": accuracy,
                    "extraction": extracted}

        # ── AUTOTUNE MODE ─────────────────────────────────────────────────────
        iterations_log: list = []

        async def on_iter_event(event: dict):
            nonlocal iterations_log
            if event.get("type") == "autotune_iteration_complete":
                iterations_log.append({
                    "iteration": event.get("iteration"),
                    "accuracy": event.get("accuracy"),
                    "extracted": event.get("extracted"),
                    "judge_result": event.get("judge_result"),
                })
            await _emit(event_callback, {**event, "run_id": run_id, "filename": filename})

        result = await autotune(
            client, model_name, pdf_data, initial_prompt,
            accuracy_threshold=accuracy_threshold,
            max_iterations=max_iterations,
            progress_callback=on_iter_event,
        )

        best = result.get("best_result") or {}
        final_extracted = best.get("extracted", {})
        final_accuracy = float(result.get("best_accuracy", 0))
        initial_accuracy = float(result["iterations"][0]["accuracy"]) if result["iterations"] else 0

        store.update_file(
            run_id, filename,
            status="complete",
            accuracy=final_accuracy,
            initial_accuracy=initial_accuracy,
            extraction=final_extracted,
            judge_result=best.get("judge_result"),
            autotune_iters=iterations_log,
            completed_at=store._now(),
        )
        await _emit(event_callback, {
            "type": "file_complete", "run_id": run_id, "filename": filename,
            "accuracy": final_accuracy, "extraction": final_extracted,
            "message": f"Done — best accuracy: {final_accuracy:.0f}% ({len(result['iterations'])} iter)",
        })
        return {"filename": filename, "status": "complete", "accuracy": final_accuracy}

    except Exception as exc:
        err = str(exc)
        store.update_file(run_id, filename, status="failed", error=err,
                          completed_at=store._now())
        await _emit(event_callback, {
            "type": "file_error", "run_id": run_id, "filename": filename,
            "message": f"Failed: {err}",
        })
        return {"filename": filename, "status": "failed", "error": err}

    finally:
        os.unlink(tmp_path)


async def run_pipeline(
    client,
    model_name: str,
    run_id: str,
    pdf_files: list[tuple[str, bytes]],   # [(filename, bytes), ...]
    settings: dict,
    event_callback: Optional[Callable] = None,
) -> None:
    """Sequentially process each PDF and finalize the run."""
    total = len(pdf_files)
    processed = 0

    await _emit(event_callback, {
        "type": "pipeline_start", "run_id": run_id,
        "total_files": total,
        "message": f"Pipeline started — {total} file(s) to process",
    })

    for filename, pdf_bytes in pdf_files:
        await process_file(
            client, model_name, run_id, filename, pdf_bytes, settings, event_callback
        )
        processed += 1
        store.update_run(run_id, processed=processed)
        await _emit(event_callback, {
            "type": "pipeline_progress", "run_id": run_id,
            "processed": processed, "total": total,
            "message": f"Progress: {processed}/{total} files",
        })

    store.finish_run(run_id)
    run = store.get_run(run_id)
    await _emit(event_callback, {
        "type": "pipeline_complete", "run_id": run_id,
        "succeeded": run["succeeded"], "failed": run["failed"],
        "avg_accuracy": run["avg_accuracy"],
        "message": (
            f"Pipeline complete — {run['succeeded']} succeeded, "
            f"{run['failed']} failed, avg accuracy: {run['avg_accuracy'] or 0:.0f}%"
        ),
    })
