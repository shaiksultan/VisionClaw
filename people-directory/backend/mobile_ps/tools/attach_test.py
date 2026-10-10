import asyncio
from time import monotonic
from typing import Any

from .network_state import mobile_data_usable, network_registered


async def wait_for_attach(
    serial: str,
    timeout_seconds: float,
    stop_event: asyncio.Event | None = None,
    poll_seconds: float = 1.0,
) -> dict[str, Any]:
    started = monotonic()
    last_errors: list[str] = []
    while monotonic() - started < timeout_seconds:
        if stop_event and stop_event.is_set():
            return {
                "attach_seconds": None,
                "registered": None,
                "data_usable": None,
                "error": "job stop requested during attach",
            }
        registered, registration_error = await asyncio.to_thread(network_registered, serial)
        usable, usability_error = await asyncio.to_thread(mobile_data_usable, serial)
        last_errors = [error for error in (registration_error, usability_error) if error]
        if registered is True and usable is True:
            return {
                "attach_seconds": round(monotonic() - started, 3),
                "registered": True,
                "data_usable": True,
                "error": None,
            }
        await asyncio.sleep(poll_seconds)
    reason = "; ".join(last_errors) if last_errors else "attach timeout"
    return {
        "attach_seconds": None,
        "registered": None,
        "data_usable": None,
        "error": reason,
    }
