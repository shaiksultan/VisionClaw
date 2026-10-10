import time

from .adb import shell


class ProtectedDeviceError(RuntimeError):
    pass


def set_airplane_mode(
    serial: str,
    enabled: bool,
    protected_serial: str,
    *,
    settle_seconds: float = 1.0,
) -> bool:
    """Set airplane mode only on the explicit non-protected serial."""
    if not serial:
        raise ValueError("serial is required")
    if not protected_serial:
        raise ValueError("UE-B protected serial is required")
    if serial == protected_serial:
        raise ProtectedDeviceError("refusing to change Airplane Mode on protected UE-B")

    value = "1" if enabled else "0"
    state = "true" if enabled else "false"
    shell(serial, "settings", "put", "global", "airplane_mode_on", value)
    shell(
        serial,
        "am",
        "broadcast",
        "-a",
        "android.intent.action.AIRPLANE_MODE",
        "--ez",
        "state",
        state,
    )
    if settle_seconds:
        time.sleep(settle_seconds)
    actual = get_airplane_mode(serial)
    if actual is None:
        raise RuntimeError("could not verify Airplane Mode state")
    if actual != enabled:
        raise RuntimeError(f"Airplane Mode verification failed: expected {enabled}, got {actual}")
    return actual


def get_airplane_mode(serial: str) -> bool | None:
    raw = shell(serial, "settings", "get", "global", "airplane_mode_on")
    if raw == "1":
        return True
    if raw == "0":
        return False
    return None
