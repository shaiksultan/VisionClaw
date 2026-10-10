"""Laptop-side web browsing over UE-A USB tether.

Traffic is generated on the PC (HTTP GET), bound to the tether interface IPv4.
ADB is not used to open pages on the phone.
"""

from __future__ import annotations

import platform
import subprocess
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _curl_via_source(url: str, source_ip: str, timeout: float = 30) -> dict[str, Any]:
    started = time.perf_counter()
    start_ts = _utc()
    system = platform.system().lower()
    if system == "windows":
        # curl.exe is available on modern Windows; --interface accepts IP
        cmd = [
            "curl.exe",
            "-sS",
            "-L",
            "--max-time",
            str(int(timeout)),
            "--interface",
            source_ip,
            "-o",
            "NUL",
            "-w",
            "%{http_code}|%{time_total}|%{size_download}",
            url,
        ]
    else:
        cmd = [
            "curl",
            "-sS",
            "-L",
            "--max-time",
            str(int(timeout)),
            "--interface",
            source_ip,
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}|%{time_total}|%{size_download}",
            url,
        ]
    try:
        completed = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout + 5,
            encoding="utf-8",
            errors="replace",
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {
            "url": url,
            "start_timestamp": start_ts,
            "finish_timestamp": _utc(),
            "duration_ms": round((time.perf_counter() - started) * 1000),
            "status": None,
            "bytes": None,
            "error": str(exc),
            "source_ip": source_ip,
            "path": "laptop_via_ue_a_usb_tether",
        }

    finish_ts = _utc()
    duration_ms = round((time.perf_counter() - started) * 1000)
    raw = (completed.stdout or "").strip()
    status = None
    curl_seconds = None
    size = None
    if "|" in raw:
        parts = raw.split("|")
        try:
            status = int(parts[0])
        except ValueError:
            status = None
        try:
            curl_seconds = float(parts[1])
            duration_ms = round(curl_seconds * 1000)
        except (ValueError, IndexError):
            pass
        try:
            size = int(float(parts[2]))
        except (ValueError, IndexError):
            size = None

    ok = completed.returncode == 0 and status is not None and 200 <= status < 400
    return {
        "url": url,
        "start_timestamp": start_ts,
        "finish_timestamp": finish_ts,
        "duration_ms": duration_ms,
        "status": status,
        "bytes": size,
        "error": None if ok else ((completed.stderr or raw or "request failed").strip() or "request failed"),
        "source_ip": source_ip,
        "path": "laptop_via_ue_a_usb_tether",
        "success": ok,
    }


def run_web_test(
    websites: list[str] | None = None,
    *,
    tether_interface: dict[str, Any] | None = None,
    serial: str | None = None,
) -> dict[str, Any]:
    """Browse configured URLs from the laptop through the USB-tether NIC."""
    urls = [u.strip() for u in (websites or []) if u and u.strip()]
    iface = tether_interface or {}
    source_ip = iface.get("ipv4")
    if not source_ip:
        return {
            "mocked": False,
            "success": False,
            "results": [],
            "latency_ms": None,
            "error": "No USB tether IPv4 on laptop — enable UE-A USB tethering first",
            "path": "laptop_via_ue_a_usb_tether",
            "ue_a_serial": serial,
            "interface": iface or None,
        }

    results = []
    for url in urls:
        parsed = urlparse(url if "://" in url else f"https://{url}")
        target = parsed.geturl()
        results.append(_curl_via_source(target, source_ip))

    successes = [r for r in results if r.get("success")]
    durations = [r["duration_ms"] for r in successes if isinstance(r.get("duration_ms"), int)]
    return {
        "mocked": False,
        "success": bool(results) and all(r.get("success") for r in results),
        "results": results,
        "latency_ms": round(sum(durations) / len(durations), 1) if durations else None,
        "error": None if successes else "all website requests failed",
        "path": "laptop_via_ue_a_usb_tether",
        "ue_a_serial": serial,
        "interface": {
            "name": iface.get("name"),
            "ipv4": source_ip,
            "description": iface.get("description"),
        },
        "note": "Traffic generated on laptop; exits via UE-A mobile data over USB tether (not ADB).",
    }
