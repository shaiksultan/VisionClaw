from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


class Measurement(BaseModel):
    value: float | int | str | bool | None = None
    error: str | None = None


class CycleResult(BaseModel):
    cycle_number: int
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = None
    status: str = "RUNNING"
    steps: list[dict[str, Any]] = Field(default_factory=list)
    attach: dict[str, Any] = Field(default_factory=dict)
    web: dict[str, Any] | None = None
    speed: dict[str, Any] | None = None
    volte: dict[str, Any] | None = None
    error: str | None = None
