import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from models.job import JobCreate, JobState, JobStatus, TERMINAL_STATES, validate_transition
from storage.database import JobDatabase

from .runner import JobRunner
from .tools.evidence import record_event, write_json_atomic


JOB_SUBDIRECTORIES = (
    "input",
    "raw/adb",
    "raw/ping",
    "raw/logcat",
    "raw/screenshots",
    "raw/speedtest",
    "cycles",
    "reports",
)


def default_job_root() -> Path:
    backend = Path(__file__).resolve().parents[1]
    configured = os.getenv("MOBILE_PS_JOB_ROOT")
    return Path(configured).expanduser().resolve() if configured else (backend / ".." / "data" / "lab-jobs").resolve()


class JobManager:
    def __init__(self, root: Path | None = None):
        self.root = (root or default_job_root()).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.database = JobDatabase(self.root / "jobs.sqlite3")
        self._statuses: dict[str, JobStatus] = {job.job_id: job for job in self.database.list()}
        self._stop_events: dict[str, asyncio.Event] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}

    def _job_path(self, job_id: str) -> Path:
        if not job_id.startswith("PS-") or "/" in job_id or "\\" in job_id or ".." in job_id:
            raise ValueError("invalid job ID")
        return self.root / job_id

    def _save_status(self, status: JobStatus) -> None:
        status.updated_at = datetime.now(timezone.utc)
        self._statuses[status.job_id] = status
        self.database.upsert(status)
        path = self._job_path(status.job_id)
        result_path = path / "result.json"
        try:
            existing = json.loads(result_path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            existing = {}
        existing.update(status.model_dump(mode="json"))
        write_json_atomic(result_path, existing)

    def transition(self, job_id: str, target: JobState, error: str | None = None) -> JobStatus:
        status = self.get(job_id)
        validate_transition(status.state, target)
        status.state = target
        status.status = target.value
        status.error = error
        if target == JobState.RUNNING and status.started_at is None:
            status.started_at = datetime.now(timezone.utc)
        if status.started_at:
            status.elapsed_seconds = round(
                (datetime.now(timezone.utc) - status.started_at).total_seconds(), 1
            )
        self._save_status(status)
        record_event(self._job_path(job_id) / "events.jsonl", "JOB_STATE_CHANGED", state=target.value, error=error)
        return status

    def create(self, config: JobCreate) -> JobStatus:
        job_id = datetime.now().strftime("PS-%Y%m%d-%H%M%S")
        path = self._job_path(job_id)
        if path.exists():
            raise RuntimeError("a job was already created in this second; retry")
        for subdirectory in JOB_SUBDIRECTORIES:
            (path / subdirectory).mkdir(parents=True, exist_ok=True)
        (path / "events.jsonl").touch()
        write_json_atomic(path / "anomalies.json", [])
        write_json_atomic(path / "input" / "job.json", config.model_dump(mode="json"))
        status = JobStatus(
            job_id=job_id,
            status="CREATED",
            state=JobState.CREATED,
            requested_cycles=config.cycles,
            config=config.model_dump(mode="json"),
            ue_a={"serial": config.ue_a_serial, "role": "ACTIVE_TEST_DEVICE"},
            ue_b={"serial": config.ue_b_serial, "role": "CONTINUOUS_MONITOR_DEVICE"},
        )
        self._save_status(status)
        record_event(path / "events.jsonl", "JOB_CREATED", config=status.config)
        return status

    def start(self, status: JobStatus, config: JobCreate) -> None:
        stop_event = asyncio.Event()
        self._stop_events[status.job_id] = stop_event
        self.transition(status.job_id, JobState.RUNNING)

        def persist(state: str, completed_cycles: int, error: str | None) -> None:
            current = self.get(status.job_id)
            current.completed_cycles = completed_cycles
            current.current_cycle = min(completed_cycles + 1, current.requested_cycles)
            current.progress = round(100.0 * completed_cycles / max(current.requested_cycles, 1), 1)
            current.error = error
            current.status = current.state.value
            if current.started_at:
                current.elapsed_seconds = round(
                    (datetime.now(timezone.utc) - current.started_at).total_seconds(), 1
                )
            self._save_status(current)

        runner = JobRunner(status.job_id, self._job_path(status.job_id), config, stop_event, persist)

        async def execute() -> None:
            state, cycles, error = await runner.run()
            current = self.get(status.job_id)
            current.completed_cycles = len(cycles)
            self._save_status(current)
            target = JobState(state)
            if current.state == JobState.STOPPING and target == JobState.STOPPED:
                self.transition(status.job_id, JobState.STOPPED, error)
            elif current.state not in TERMINAL_STATES:
                self.transition(status.job_id, target, error)

        self._tasks[status.job_id] = asyncio.create_task(execute())

    def create_and_start(self, config: JobCreate) -> JobStatus:
        status = self.create(config)
        self.start(status, config)
        return self.get(status.job_id)

    def get(self, job_id: str) -> JobStatus:
        status = self._statuses.get(job_id) or self.database.get(job_id)
        if not status:
            raise LookupError(f"job not found: {job_id}")
        return status

    def list(self) -> list[JobStatus]:
        return sorted(self._statuses.values(), key=lambda job: job.job_id, reverse=True)

    def stop(self, job_id: str) -> JobStatus:
        status = self.get(job_id)
        if status.state in TERMINAL_STATES:
            return status
        if status.state == JobState.CREATED:
            return self.transition(job_id, JobState.STOPPED)
        if status.state == JobState.RUNNING:
            status = self.transition(job_id, JobState.STOPPING)
        event = self._stop_events.get(job_id)
        if event:
            event.set()
        return status

    def cycles(self, job_id: str) -> list[dict[str, Any]]:
        self.get(job_id)
        results = []
        for path in sorted((self._job_path(job_id) / "cycles").glob("cycle-*.json")):
            results.append(json.loads(path.read_text(encoding="utf-8")))
        return results

    def events(self, job_id: str) -> list[dict[str, Any]]:
        self.get(job_id)
        path = self._job_path(job_id) / "events.jsonl"
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

    def anomalies(self, job_id: str) -> list[dict[str, Any]]:
        self.get(job_id)
        return json.loads((self._job_path(job_id) / "anomalies.json").read_text(encoding="utf-8"))

    def result(self, job_id: str) -> dict[str, Any]:
        self.get(job_id)
        return json.loads((self._job_path(job_id) / "result.json").read_text(encoding="utf-8"))

    def job_path(self, job_id: str) -> Path:
        self.get(job_id)
        return self._job_path(job_id)
