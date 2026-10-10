import re
from typing import Any

from .adb import shell


def _capture(serial: str, command: tuple[str, ...]) -> tuple[str | None, str | None]:
    try:
        return shell(serial, *command), None
    except Exception as exc:
        return None, str(exc)


def network_registered(serial: str) -> tuple[bool | None, str | None]:
    output, error = _capture(serial, ("dumpsys", "telephony.registry"))
    if error:
        return None, error
    assert output is not None
    matches = re.findall(r"mServiceState=.*?(?:mVoiceRegState|voiceRegState)=(\d+)", output)
    if not matches:
        matches = re.findall(r"(?:mDataRegState|dataRegState)=(\d+)", output)
    if not matches:
        return None, "registration state not present in telephony.registry"
    return any(value == "0" for value in matches), None


def mobile_data_usable(serial: str, host: str = "8.8.8.8") -> tuple[bool | None, str | None]:
    try:
        result = shell(serial, "ping", "-c", "1", "-W", "2", host, timeout=5, check=False)
    except Exception as exc:
        return None, str(exc)
    return ("1 received" in result or "1 packets received" in result), None


def collect_network_status(serial: str) -> dict[str, Any]:
    result: dict[str, Any] = {}
    errors: dict[str, str] = {}
    commands = {
        "ip_address": ("ip", "-o", "-4", "addr", "show", "rmnet0"),
        "telephony": ("dumpsys", "telephony.registry"),
        "mobile_data": ("settings", "get", "global", "mobile_data"),
        "ims": ("dumpsys", "ims"),
    }
    values = {}
    for name, command in commands.items():
        values[name], error = _capture(serial, command)
        if error:
            errors[name] = error

    ip_match = re.search(r"\binet\s+([0-9.]+)", values["ip_address"] or "")
    result["ip_address"] = ip_match.group(1) if ip_match else None
    if not ip_match and "ip_address" not in errors:
        errors["ip_address"] = "mobile interface IPv4 address not found"

    telephony = values["telephony"] or ""
    rat_match = re.search(r"(?:mDataNetworkType|dataNetworkType)=([A-Z0-9_]+|\d+)", telephony)
    signal_match = re.search(r"(?:rsrp|mRsrp)=(-?\d+)", telephony, re.IGNORECASE)
    result["rat"] = rat_match.group(1) if rat_match else None
    result["signal"] = f"{signal_match.group(1)} dBm" if signal_match else None
    if not rat_match and "telephony" not in errors:
        errors["rat"] = "RAT not found"
    if not signal_match and "telephony" not in errors:
        errors["signal"] = "signal measurement not found"

    raw_mobile = values["mobile_data"]
    result["mobile_data_enabled"] = raw_mobile == "1" if raw_mobile in {"0", "1"} else None
    if raw_mobile not in {"0", "1"} and "mobile_data" not in errors:
        errors["mobile_data_enabled"] = "mobile data setting unavailable"

    ims = values["ims"] or ""
    if ims:
        result["ims_registered"] = bool(re.search(r"registered\s*[:=]\s*true", ims, re.I))
    else:
        result["ims_registered"] = None
        errors.setdefault("ims_registered", errors.get("ims", "IMS status unavailable"))
    result["errors"] = errors
    return result
