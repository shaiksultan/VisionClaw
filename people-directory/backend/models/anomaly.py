from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


class Anomaly(BaseModel):
    severity: Literal["INFO", "WARNING", "CRITICAL"]
    kind: str
    message: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    cycle_number: int | None = None
    details: dict[str, Any] = Field(default_factory=dict)
