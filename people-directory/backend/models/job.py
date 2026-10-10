from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, model_validator


class JobState(str, Enum):
    CREATED = "CREATED"
    RUNNING = "RUNNING"
    STOPPING = "STOPPING"
    STOPPED = "STOPPED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


TERMINAL_STATES = {JobState.STOPPED, JobState.COMPLETED, JobState.FAILED}
ALLOWED_TRANSITIONS = {
    JobState.CREATED: {JobState.RUNNING, JobState.STOPPED, JobState.FAILED},
    JobState.RUNNING: {JobState.STOPPING, JobState.STOPPED, JobState.COMPLETED, JobState.FAILED},
    JobState.STOPPING: {JobState.STOPPED, JobState.FAILED},
    JobState.STOPPED: set(),
    JobState.COMPLETED: set(),
    JobState.FAILED: set(),
}


def validate_transition(current: JobState, target: JobState) -> None:
    if target not in ALLOWED_TRANSITIONS[current]:
        raise ValueError(f"invalid job state transition: {current.value} -> {target.value}")


class JobCreate(BaseModel):
    ue_a_serial: str = Field(min_length=1)
    ue_b_serial: str = Field(min_length=1)
    destination_ip: str = Field(default="10.106.156.39", min_length=1)
    ping_interval_seconds: int = Field(default=1, ge=1, le=5)
    cycles: int = Field(default=5, ge=1, le=10000)
    call_duration_seconds: int = Field(default=10, ge=1, le=600)
    attach_timeout_seconds: float = Field(default=120.0, gt=0, le=600)
    cycle_interval_seconds: float = Field(default=0.0, ge=0, le=3600)
    websites: list[str] = Field(
        default_factory=lambda: [
            "https://www.google.com",
            "https://www.cloudflare.com",
            "https://www.wikipedia.org",
            "https://www.apple.com",
            "https://www.microsoft.com",
        ]
    )
    run_web_test: bool = False
    run_speed_test: bool = False
    run_volte_ab: bool = False
    run_volte_ba: bool = False
    collect_logcat: bool = True
    screenshot_on_failure: bool = True
    # Back-compat aliases used by early frontend builds
    web_test: bool | None = None
    speed_test: bool | None = None
    volte_test: bool | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def normalize(self) -> "JobCreate":
        if self.ue_a_serial == self.ue_b_serial:
            raise ValueError("UE-A and UE-B cannot share a serial")
        if self.ping_interval_seconds not in (1, 2, 5):
            raise ValueError("ping_interval_seconds must be 1, 2, or 5")
        meta = self.metadata or {}
        if "destination_ip" in meta and meta["destination_ip"]:
            self.destination_ip = str(meta["destination_ip"])
        if "ping_interval_seconds" in meta:
            self.ping_interval_seconds = int(meta["ping_interval_seconds"])
        if "call_duration_seconds" in meta:
            self.call_duration_seconds = int(meta["call_duration_seconds"])
        if isinstance(meta.get("websites"), list) and meta["websites"]:
            self.websites = [str(u) for u in meta["websites"]]
        if self.web_test is not None:
            self.run_web_test = bool(self.web_test)
        if self.speed_test is not None:
            self.run_speed_test = bool(self.speed_test)
        if self.volte_test is not None:
            self.run_volte_ab = bool(self.volte_test)
            self.run_volte_ba = bool(self.volte_test)
        if "volte_ab" in meta:
            self.run_volte_ab = bool(meta["volte_ab"])
        if "volte_ba" in meta:
            self.run_volte_ba = bool(meta["volte_ba"])
        evidence = meta.get("evidence") if isinstance(meta.get("evidence"), dict) else {}
        if "screenshots" in evidence:
            self.screenshot_on_failure = bool(evidence["screenshots"])
        if "logcat" in evidence:
            self.collect_logcat = bool(evidence["logcat"])
        return self


class ReadinessRequest(BaseModel):
    ue_a_serial: str = Field(min_length=1)
    ue_b_serial: str = Field(min_length=1)
    destination_ip: str = Field(default="10.106.156.39", min_length=1)

    @model_validator(mode="after")
    def different_devices(self) -> "ReadinessRequest":
        if self.ue_a_serial == self.ue_b_serial:
            raise ValueError("UE-A and UE-B cannot share a serial")
        return self


class ConnectivityRequest(BaseModel):
    destination_ip: str = Field(default="10.106.156.39", min_length=1)
    count: int = Field(default=4, ge=1, le=20)
    # Optional device context for UI flows that still send serials
    ue_a_serial: str | None = None
    ue_b_serial: str | None = None
    host: str | None = None

    @model_validator(mode="after")
    def resolve_host(self) -> "ConnectivityRequest":
        if self.host:
            self.destination_ip = self.host
        return self


class JobStatus(BaseModel):
    job_id: str
    status: str = "CREATED"
    state: JobState = JobState.CREATED
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: datetime | None = None
    completed_cycles: int = 0
    current_cycle: int = 0
    requested_cycles: int = 1
    current_step: str = "IDLE"
    progress: float = 0.0
    elapsed_seconds: float = 0.0
    anomaly_count: int = 0
    latest_event: str | None = None
    monitoring: dict[str, Any] = Field(default_factory=dict)
    ue_a: dict[str, Any] = Field(default_factory=dict)
    ue_b: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)
