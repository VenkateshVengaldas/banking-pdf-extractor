import asyncio
import json
import os
import tempfile
from pathlib import Path
from typing import Optional

from google import genai
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from autotune import autotune
from excel_export import build_excel
from extractor import build_extraction_prompt, extract_fields
from judge import judge_extraction
from pdf_processor import extract_text_from_pdf
import pipeline as pipeline_mod
import pipeline_store as store

load_dotenv()

app = FastAPI(title="Banking PDF Extractor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:5175"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Per-run SSE queues: run_id → list of asyncio.Queue
_run_queues: dict[str, list[asyncio.Queue]] = {}


def _get_client() -> tuple:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set in environment / .env file")
    client = genai.Client(api_key=api_key)
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    return client, model_name


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


# ══════════════════════════════════════════════════════════════════════════════
# SINGLE-FILE PROCESS (existing feature)
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/process")
async def process_pdfs(
    files: list[UploadFile] = File(...),
    accuracy_threshold: float = Form(default=85.0),
    max_iterations: int = Form(default=3),
    custom_prompt: Optional[str] = Form(default=None),
):
    async def generate():
        try:
            client, model_name = _get_client()
        except Exception as e:
            yield _sse({"type": "error", "message": str(e)})
            return

        all_results = []

        for file_idx, file in enumerate(files):
            filename = file.filename or f"document_{file_idx + 1}.pdf"

            yield _sse({
                "type": "file_start", "filename": filename,
                "file_index": file_idx, "total_files": len(files),
                "message": f"Processing {filename} ({file_idx + 1}/{len(files)})...",
            })

            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                tmp.write(await file.read())
                tmp_path = tmp.name

            try:
                yield _sse({"type": "step", "step": "pdf_extraction", "filename": filename,
                             "message": "Extracting text and images from PDF..."})
                pdf_data = extract_text_from_pdf(tmp_path)
                yield _sse({"type": "step_complete", "step": "pdf_extraction", "filename": filename,
                             "message": f"PDF processed — {pdf_data['page_count']} page(s), "
                                        f"{'scanned' if pdf_data['is_scanned'] else 'text-based'}"})

                initial_prompt = build_extraction_prompt(custom_prompt)
                yield _sse({"type": "step", "step": "autotune", "filename": filename,
                             "message": f"Starting OPRO auto-tune — {max_iterations} iteration(s)..."})

                events_queue: asyncio.Queue = asyncio.Queue()

                async def progress_callback(event: dict):
                    await events_queue.put({**event, "filename": filename})

                autotune_task = asyncio.create_task(
                    autotune(client, model_name, pdf_data, initial_prompt,
                             accuracy_threshold=accuracy_threshold,
                             max_iterations=max_iterations,
                             progress_callback=progress_callback)
                )

                while not autotune_task.done():
                    try:
                        event = await asyncio.wait_for(events_queue.get(), timeout=0.15)
                        yield _sse(event)
                    except asyncio.TimeoutError:
                        pass
                while not events_queue.empty():
                    yield _sse(await events_queue.get())

                autotune_result = await autotune_task
                final_extracted = autotune_result["best_result"]["extracted"] if autotune_result["best_result"] else {}
                final_accuracy = autotune_result["best_accuracy"]
                initial_extracted = autotune_result["iterations"][0]["extracted"] if autotune_result["iterations"] else {}
                initial_accuracy = autotune_result["iterations"][0]["accuracy"] if autotune_result["iterations"] else 0.0
                initial_judge = autotune_result["iterations"][0]["judge_result"] if autotune_result["iterations"] else {}

                yield _sse({"type": "step_complete", "step": "autotune", "filename": filename,
                             "message": f"Done — best accuracy: {final_accuracy:.0f}%",
                             "converged": autotune_result["converged"]})

                result = {
                    "filename": filename,
                    "pdf_info": {"page_count": pdf_data["page_count"], "is_scanned": pdf_data["is_scanned"]},
                    "initial_extraction": initial_extracted, "initial_accuracy": initial_accuracy,
                    "initial_judge": initial_judge, "final_extraction": final_extracted,
                    "final_accuracy": final_accuracy, "autotune": autotune_result,
                }
                all_results.append(result)
                yield _sse({"type": "file_complete", "filename": filename, "result": result})

            except Exception as e:
                yield _sse({"type": "file_error", "filename": filename, "message": str(e)})
            finally:
                os.unlink(tmp_path)

        yield _sse({"type": "all_complete", "results": all_results})

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ══════════════════════════════════════════════════════════════════════════════
# PIPELINE ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/pipeline/runs")
async def create_pipeline_run(
    files: list[UploadFile] = File(...),
    settings_json: str = Form(default="{}"),
    folder_label: str = Form(default="uploaded"),
):
    """
    Create and immediately start a pipeline run.
    Accepts uploaded PDF files + a settings JSON string.

    settings_json schema:
    {
      "extraction_prompt": null | "...",
      "auto_tune": true,
      "accuracy_threshold": 85,
      "max_iterations": 3
    }
    """
    try:
        settings = json.loads(settings_json)
    except Exception:
        settings = {}

    settings.setdefault("auto_tune", True)
    settings.setdefault("accuracy_threshold", 85)
    settings.setdefault("max_iterations", 3)
    settings.setdefault("extraction_prompt", None)

    pdf_files: list[tuple[str, bytes]] = []
    for f in files:
        if f.filename and f.filename.lower().endswith(".pdf"):
            pdf_files.append((f.filename, await f.read()))

    if not pdf_files:
        raise HTTPException(status_code=400, detail="No PDF files provided")

    try:
        client, model_name = _get_client()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    run_id = store.create_run(folder_label, settings, len(pdf_files))
    for filename, _ in pdf_files:
        store.create_file(run_id, filename)

    _run_queues[run_id] = []

    async def on_event(event: dict):
        for q in _run_queues.get(run_id, []):
            await q.put(event)

    async def run_bg():
        try:
            await pipeline_mod.run_pipeline(
                client, model_name, run_id, pdf_files, settings, on_event
            )
        except Exception as e:
            store.update_run(run_id, status="failed")
            await on_event({"type": "pipeline_error", "run_id": run_id, "message": str(e)})
        finally:
            _run_queues.pop(run_id, None)

    asyncio.create_task(run_bg())
    return {"run_id": run_id, "total_files": len(pdf_files), "status": "running"}


@app.get("/api/pipeline/runs")
async def list_pipeline_runs():
    return store.list_runs()


@app.get("/api/pipeline/runs/{run_id}")
async def get_pipeline_run(run_id: str):
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@app.get("/api/pipeline/runs/{run_id}/events")
async def pipeline_run_events(run_id: str):
    """SSE stream for a specific pipeline run. Works for active AND completed runs."""
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    q: asyncio.Queue = asyncio.Queue()
    _run_queues.setdefault(run_id, []).append(q)

    async def generate():
        try:
            # If run already complete, just send current state and close
            if run["status"] in ("complete", "failed"):
                yield _sse({"type": "snapshot", "run": store.get_run(run_id)})
                return

            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=30)
                    yield _sse(event)
                    if event.get("type") in ("pipeline_complete", "pipeline_error"):
                        break
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            queues = _run_queues.get(run_id, [])
            if q in queues:
                queues.remove(q)

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/pipeline/runs/{run_id}/export")
async def export_pipeline_run(run_id: str):
    """Download pipeline run results as a formatted Excel workbook."""
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    try:
        xlsx_bytes = build_excel(run)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel export failed: {e}")

    safe_id = run_id.replace("/", "_")
    filename = f"pipeline_{safe_id}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.delete("/api/pipeline/runs/{run_id}")
async def delete_pipeline_run(run_id: str):
    """Remove a run from the dashboard (DB only — does not affect files)."""
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    with store._lock, store._conn() as conn:
        conn.execute("DELETE FROM pipeline_files WHERE run_id=?", (run_id,))
        conn.execute("DELETE FROM pipeline_runs WHERE run_id=?", (run_id,))
    return {"deleted": run_id}
