from typing import Any


def run_volte_test(
    ue_a_serial: str,
    ue_b_serial: str | None = None,
    *,
    call_duration_seconds: int = 10,
    run_ab: bool = True,
    run_ba: bool = True,
) -> dict[str, Any]:
    """V1 MOCKED adapter — real telecom call control lands in V3."""
    empty = {
        "mocked": True,
        "success": None,
        "dial_timestamp": None,
        "connected_timestamp": None,
        "setup_ms": None,
        "duration": None,
        "drop": None,
        "rat": None,
        "ims": None,
        "error": "MOCKED in V1: deterministic VoLTE adapter not implemented",
    }
    return {
        "mocked": True,
        "call_duration_seconds": call_duration_seconds,
        "ue_a_serial": ue_a_serial,
        "ue_b_serial": ue_b_serial,
        "a_to_b": empty if run_ab else {"skipped": True},
        "b_to_a": empty if run_ba else {"skipped": True},
        "reason": "MOCKED in V1: deterministic VoLTE adapter not implemented",
    }
