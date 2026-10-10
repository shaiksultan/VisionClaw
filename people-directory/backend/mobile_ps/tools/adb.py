import re
import subprocess
from dataclasses import dataclass, field


class AdbError(RuntimeError):
    pass


@dataclass(frozen=True)
class AdbDevice:
    serial: str
    state: str
    properties: dict[str, str] = field(default_factory=dict)


def _validate_serial(serial: str) -> str:
    if not serial or serial.strip() != serial or any(ch.isspace() for ch in serial):
        raise ValueError("an explicit valid device serial is required")
    return serial


def run_adb(
    serial: str,
    *args: str,
    timeout: float = 30,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    """Run an ADB command against exactly one explicitly selected device."""
    serial = _validate_serial(serial)
    command = ["adb", "-s", serial, *map(str, args)]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            encoding="utf-8",
            errors="replace",
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise AdbError(f"ADB command failed for {serial}: {exc}") from exc
    if check and result.returncode != 0:
        reason = (result.stderr or result.stdout or "unknown adb error").strip()
        raise AdbError(f"ADB command failed for {serial}: {reason}")
    return result


def list_devices(timeout: float = 10) -> list[AdbDevice]:
    try:
        result = subprocess.run(
            ["adb", "devices", "-l"],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            encoding="utf-8",
            errors="replace",
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise AdbError(f"could not list ADB devices: {exc}") from exc
    if result.returncode != 0:
        raise AdbError((result.stderr or "adb devices failed").strip())

    devices: list[AdbDevice] = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line or line.startswith("List of devices") or line.startswith("*"):
            continue
        parts = re.split(r"\s+", line)
        if len(parts) < 2:
            continue
        serial, state = parts[0], parts[1]
        if serial in {"*", "adb"} or state in {"daemon"}:
            continue
        # Only return usable / known transport states; never invent devices
        if state not in {"device", "offline", "unauthorized", "no permissions"}:
            continue
        props = {}
        for token in parts[2:]:
            if ":" in token:
                key, value = token.split(":", 1)
                props[key] = value
        devices.append(AdbDevice(serial=serial, state=state, properties=props))
    return devices


def getprop(serial: str, name: str) -> str | None:
    value = run_adb(serial, "shell", "getprop", name).stdout.strip()
    return value or None


def shell(serial: str, *args: str, timeout: float = 30, check: bool = True) -> str:
    return run_adb(serial, "shell", *args, timeout=timeout, check=check).stdout.strip()
