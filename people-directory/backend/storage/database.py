import json
import sqlite3
import threading
from pathlib import Path

from models.job import JobStatus


class JobDatabase:
    """Small SQLite index. Job result.json remains the source of truth."""

    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    state TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path, timeout=10)

    def upsert(self, status: JobStatus) -> None:
        payload = status.model_dump_json()
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO jobs(job_id, state, updated_at, payload)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                  state=excluded.state,
                  updated_at=excluded.updated_at,
                  payload=excluded.payload
                """,
                (status.job_id, status.state.value, status.updated_at.isoformat(), payload),
            )

    def get(self, job_id: str) -> JobStatus | None:
        with self._connect() as conn:
            row = conn.execute("SELECT payload FROM jobs WHERE job_id=?", (job_id,)).fetchone()
        return JobStatus.model_validate_json(row[0]) if row else None

    def list(self) -> list[JobStatus]:
        with self._connect() as conn:
            rows = conn.execute("SELECT payload FROM jobs ORDER BY job_id DESC").fetchall()
        return [JobStatus.model_validate(json.loads(row[0])) for row in rows]
