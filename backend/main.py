import asyncio
import json
import os
import tempfile
from typing import Optional

from google import genai
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from autotune import autotune
from extractor import build_extraction_prompt, extract_fields
from judge import judge_extraction
from pdf_processor import extract_text_from_pdf

load_dotenv()

app = FastAPI(title="Banking PDF Extractor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:5175"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_client() -> tuple:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set in environment / .env file")
    client = genai.Client(api_key=api_key)
    model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-pro")
    return client, model_name


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


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
                "type": "file_start",
                "filename": filename,
                "file_index": file_idx,
                "total_files": len(files),
                "message": f"Processing {filename} ({file_idx + 1}/{len(files)})...",
            })

            # Write upload to temp file
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                tmp.write(await file.read())
                tmp_path = tmp.name

            try:
                # ── Step 1: PDF text/image extraction ──────────────────────
                yield _sse({
                    "type": "step",
                    "step": "pdf_extraction",
                    "filename": filename,
                    "message": "Extracting text and images from PDF...",
                })

                pdf_data = extract_text_from_pdf(tmp_path)

                yield _sse({
                    "type": "step_complete",
                    "step": "pdf_extraction",
                    "filename": filename,
                    "message": (
                        f"PDF processed — {pdf_data['page_count']} page(s), "
                        f"{'scanned/image-based' if pdf_data['is_scanned'] else 'text-based'}"
                    ),
                })

                # ── Steps 2-4: OPRO iterative extract → judge → optimize ───
                initial_prompt = build_extraction_prompt(custom_prompt)

                yield _sse({
                    "type": "step",
                    "step": "autotune",
                    "filename": filename,
                    "message": (
                        f"Starting OPRO auto-tune — {max_iterations} iteration(s): "
                        "extract → judge → optimize prompt → repeat..."
                    ),
                })

                events_queue: asyncio.Queue = asyncio.Queue()

                async def progress_callback(event: dict):
                    await events_queue.put({**event, "filename": filename})

                autotune_task = asyncio.create_task(
                    autotune(
                        client,
                        model_name,
                        pdf_data,
                        initial_prompt,
                        accuracy_threshold=accuracy_threshold,
                        max_iterations=max_iterations,
                        progress_callback=progress_callback,
                    )
                )

                # Stream all autotune events live
                while not autotune_task.done():
                    try:
                        event = await asyncio.wait_for(events_queue.get(), timeout=0.15)
                        yield _sse(event)
                    except asyncio.TimeoutError:
                        pass

                # Drain any remaining events
                while not events_queue.empty():
                    yield _sse(await events_queue.get())

                autotune_result = await autotune_task

                # Use best result across all iterations
                final_extracted = autotune_result["best_result"]["extracted"] if autotune_result["best_result"] else {}
                final_accuracy = autotune_result["best_accuracy"]
                initial_extracted = autotune_result["iterations"][0]["extracted"] if autotune_result["iterations"] else {}
                initial_accuracy = autotune_result["iterations"][0]["accuracy"] if autotune_result["iterations"] else 0.0
                initial_judge = autotune_result["iterations"][0]["judge_result"] if autotune_result["iterations"] else {}

                yield _sse({
                    "type": "step_complete",
                    "step": "autotune",
                    "filename": filename,
                    "message": (
                        f"Done — {len(autotune_result['iterations'])} iteration(s) complete. "
                        f"Best accuracy: {final_accuracy:.0f}% "
                        f"({'converged ✓' if autotune_result['converged'] else 'all iterations used'})"
                    ),
                    "converged": autotune_result["converged"],
                })

                result = {
                    "filename": filename,
                    "pdf_info": {
                        "page_count": pdf_data["page_count"],
                        "is_scanned": pdf_data["is_scanned"],
                    },
                    "initial_extraction": initial_extracted,
                    "initial_accuracy": initial_accuracy,
                    "initial_judge": initial_judge,
                    "final_extraction": final_extracted,
                    "final_accuracy": final_accuracy,
                    "autotune": autotune_result,
                }
                all_results.append(result)

                yield _sse({
                    "type": "file_complete",
                    "filename": filename,
                    "result": result,
                })

            except Exception as e:
                yield _sse({
                    "type": "file_error",
                    "filename": filename,
                    "message": str(e),
                })
            finally:
                os.unlink(tmp_path)

        yield _sse({"type": "all_complete", "results": all_results})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
