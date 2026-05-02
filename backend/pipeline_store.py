"""
SQLite-backed store for pipeline runs.
Thread-safe via a module-level lock; all writes go through _execute().
"""
import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

DB_PATH = Path(__file__).parent / "pipeline.db"
_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _lock, _conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS pipeline_runs (
            run_id       TEXT PRIMARY KEY,
            created_at   TEXT NOT NULL,
            completed_at TEXT,
            folder_path  TEXT NOT NULL,
            settings     TEXT NOT NULL,   -- JSON
            status       TEXT NOT NULL DEFAULT 'pending',
            total_files  INTEGER NOT NULL DEFAULT 0,
            processed    INTEGER NOT NULL DEFAULT 0,
            succeeded    INTEGER NOT NULL DEFAULT 0,
            failed       INTEGER NOT NULL DEFAULT 0,
            avg_accuracy REAL
        );

        CREATE TABLE IF NOT EXISTS pipeline_files (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id          TEXT NOT NULL,
            filename        TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'pending',
            accuracy        REAL,
            initial_accuracy REAL,
            extraction      TEXT,   -- JSON
            judge_result    TEXT,   -- JSON
            autotune_iters  TEXT,   -- JSON
            final_prompt    TEXT,   -- best prompt after autotune
            error           TEXT,
            started_at      TEXT,
            completed_at    TEXT,
            FOREIGN KEY (run_id) REFERENCES pipeline_runs(run_id)
        );
        """)


# ── Runs ──────────────────────────────────────────────────────────────────────

def create_run(folder_path: str, settings: dict, total_files: int) -> str:
    run_id = str(uuid.uuid4())[:8].upper()
    with _lock, _conn() as conn:
        conn.execute(
            "INSERT INTO pipeline_runs (run_id, created_at, folder_path, settings, status, total_files)"
            " VALUES (?, ?, ?, ?, 'running', ?)",
            (run_id, _now(), folder_path, json.dumps(settings), total_files),
        )
    return run_id


def update_run(run_id: str, **kwargs: Any) -> None:
    if not kwargs:
        return
    cols = ", ".join(f"{k} = ?" for k in kwargs)
    vals = list(kwargs.values()) + [run_id]
    with _lock, _conn() as conn:
        conn.execute(f"UPDATE pipeline_runs SET {cols} WHERE run_id = ?", vals)


def finish_run(run_id: str) -> None:
    with _lock, _conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) total, SUM(CASE WHEN status='complete' THEN 1 ELSE 0 END) ok,"
            " SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) fail,"
            " AVG(CASE WHEN accuracy IS NOT NULL THEN accuracy END) avg_acc"
            " FROM pipeline_files WHERE run_id = ?",
            (run_id,),
        ).fetchone()
        conn.execute(
            "UPDATE pipeline_runs SET status='complete', completed_at=?, processed=?,"
            " succeeded=?, failed=?, avg_accuracy=? WHERE run_id=?",
            (_now(), row["total"], row["ok"] or 0, row["fail"] or 0,
             round(row["avg_acc"] or 0, 1), run_id),
        )


def get_run(run_id: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM pipeline_runs WHERE run_id=?", (run_id,)).fetchone()
        if not row:
            return None
        d = dict(row)
        d["settings"] = json.loads(d["settings"])
        d["files"] = get_files(run_id)
        return d


def list_runs() -> list:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM pipeline_runs ORDER BY created_at DESC"
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["settings"] = json.loads(d["settings"])
            result.append(d)
        return result


# ── Files ─────────────────────────────────────────────────────────────────────

def create_file(run_id: str, filename: str) -> None:
    with _lock, _conn() as conn:
        conn.execute(
            "INSERT INTO pipeline_files (run_id, filename, status) VALUES (?, ?, 'pending')",
            (run_id, filename),
        )


def update_file(run_id: str, filename: str, **kwargs: Any) -> None:
    if not kwargs:
        return
    # Serialize dict values
    for k, v in kwargs.items():
        if isinstance(v, (dict, list)):
            kwargs[k] = json.dumps(v)
    cols = ", ".join(f"{k} = ?" for k in kwargs)
    vals = list(kwargs.values()) + [run_id, filename]
    with _lock, _conn() as conn:
        conn.execute(
            f"UPDATE pipeline_files SET {cols} WHERE run_id=? AND filename=?", vals
        )


def get_files(run_id: str) -> list:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM pipeline_files WHERE run_id=? ORDER BY id", (run_id,)
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            for col in ("extraction", "judge_result", "autotune_iters"):
                if d.get(col):
                    try:
                        d[col] = json.loads(d[col])
                    except Exception:
                        pass
            # final_prompt is plain text — leave as-is
            result.append(d)
        return result


def _migrate() -> None:
    """Add columns introduced after initial schema without dropping data."""
    with _lock, _conn() as conn:
        existing = {row[1] for row in conn.execute("PRAGMA table_info(pipeline_files)")}
        if "final_prompt" not in existing:
            conn.execute("ALTER TABLE pipeline_files ADD COLUMN final_prompt TEXT")


init_db()
_migrate()
