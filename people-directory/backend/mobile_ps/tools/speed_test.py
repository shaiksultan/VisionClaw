"""Laptop-side speed test over UE-A USB tether.

Uses Ookla Speedtest CLI on the PC when installed, bound to the tether
interface. Falls back to a timed HTTPS download bound to the same source IP.
Does not run speedtest apps on the phone via ADB.
"""

from __future__ import annotations

import json
import platform
import shutil
import subprocess
import time
from datetime import datetime, timezone
from typing import Any


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _find_speedtest_cli() -> str | None:
    for name in ("speedtest", "speedtest.exe", "ookla-speedtest"):
        path = shutil.which(name)
        if path:
            return path
    return None


def _ookla(source_ip: str, timeout: float = 120) -> dict[str, Any] | None:
    exe = _find_speedtest_cli()
    if not exe:
        return None
    cmd = [
        exe,
        "-f",
        "json",
        "--accept-license",
        "--accept-gdpr",
        "-i",
        source_ip,
    ]
    started = time.perf_counter()
    try:
        completed = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {
            "engine": "ookla",
            "success": False,
            "download_mbps": None,
            "upload_mbps": None,
            "latency_ms": None,
            "jitter_ms": None,
            "packet_loss": None,
            "server": None,
            "error": str(exc),
            "duration_ms": round((time.perf_counter() - started) * 1000),
        }
    if completed.returncode != 0:
        return {
            "engine": "ookla",
            "success": False,
            "download_mbps": None,
            "upload_mbps": None,
            "latency_ms": None,
            "jitter_ms": None,
            "packet_loss": None,
            "server": None,
            "error": (completed.stderr or completed.stdout or "speedtest failed").strip(),
            "duration_ms": round((time.perf_counter() - started) * 1000),
        }
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        return {
            "engine": "ookla",
            "success": False,
            "download_mbps": None,
            "upload_mbps": None,
            "latency_ms": None,
            "error": f"invalid speedtest JSON: {exc}",
            "duration_ms": round((time.perf_counter() - started) * 1000),
        }

    download_bps = (payload.get("download") or {}).get("bandwidth")
    upload_bps = (payload.get("upload") or {}).get("bandwidth")
    ping = payload.get("ping") or {}
    server = payload.get("server") or {}
    # Ookla bandwidth is bytes/sec
    download_mbps = round(download_bps * 8 / 1_000_000, 3) if isinstance(download_bps, (int, float)) else None
    upload_mbps = round(upload_bps * 8 / 1_000_000, 3) if isinstance(upload_bps, (int, float)) else None
    return {
        "engine": "ookla",
        "success": download_mbps is not None,
        "download_mbps": download_mbps,
        "upload_mbps": upload_mbps,
        "latency_ms": ping.get("latency"),
        "jitter_ms": ping.get("jitter"),
        "packet_loss": ping.get("packetLoss"),
        "server": server.get("name") or server.get("host"),
        "error": None,
        "duration_ms": round((time.perf_counter() - started) * 1000),
        "raw_summary": {
            "isp": (payload.get("isp") or None),
            "interface": (payload.get("interface") or {}).get("internalIp"),
        },
    }


def _download_fallback(source_ip: str, timeout: float = 60) -> dict[str, Any]:
    """Deterministic fallback: timed download of a fixed CDN object via tether IP."""
    url = "https://speed.cloudflare.com/__down?bytes=25000000"
    started = time.perf_counter()
    system = platform.system().lower()
    out = "NUL" if system == "windows" else "/dev/null"
    curl = "curl.exe" if system == "windows" else "curl"
    cmd = [
        curl,
        "-sS",
        "-L",
        "--max-time",
        str(int(timeout)),
        "--interface",
        source_ip,
        "-o",
        out,
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
            "engine": "curl_download_fallback",
            "success": False,
            "download_mbps": None,
            "upload_mbps": None,
            "latency_ms": None,
            "jitter_ms": None,
            "packet_loss": None,
            "server": "cloudflare-speed",
            "error": str(exc),
            "duration_ms": round((time.perf_counter() - started) * 1000),
        }

    raw = (completed.stdout or "").strip()
    status = None
    seconds = None
    size = None
    if "|" in raw:
        parts = raw.split("|")
        try:
            status = int(parts[0])
        except ValueError:
            status = None
        try:
            seconds = float(parts[1])
        except (ValueError, IndexError):
            seconds = None
        try:
            size = float(parts[2])
        except (ValueError, IndexError):
            size = None

    download_mbps = None
    if seconds and seconds > 0 and size and size > 0:
        download_mbps = round((size * 8) / seconds / 1_000_000, 3)
    ok = completed.returncode == 0 and status == 200 and download_mbps is not None
    return {
        "engine": "curl_download_fallback",
        "success": ok,
        "download_mbps": download_mbps,
        "upload_mbps": None,
        "latency_ms": None,
        "jitter_ms": None,
        "packet_loss": None,
        "server": "cloudflare-speed",
        "error": None if ok else ((completed.stderr or raw or "download failed").strip()),
        "duration_ms": round((time.perf_counter() - started) * 1000),
        "note": "Upload not measured in fallback engine — install Ookla Speedtest CLI for full UL/DL.",
    }


def run_speed_test(
    *,
    tether_interface: dict[str, Any] | None = None,
    serial: str | None = None,
) -> dict[str, Any]:
    iface = tether_interface or {}
    source_ip = iface.get("ipv4")
    started_at = _utc()
    if not source_ip:
        return {
            "mocked": False,
            "success": False,
            "download_mbps": None,
            "upload_mbps": None,
            "latency_ms": None,
            "jitter_ms": None,
            "packet_loss": None,
            "server": None,
            "error": "No USB tether IPv4 on laptop — enable UE-A USB tethering first",
            "path": "laptop_via_ue_a_usb_tether",
            "ue_a_serial": serial,
            "started_at": started_at,
            "finished_at": _utc(),
        }

    result = _ookla(source_ip) or _download_fallback(source_ip)
    return {
        "mocked": False,
        "path": "laptop_via_ue_a_usb_tether",
        "ue_a_serial": serial,
        "interface": {
            "name": iface.get("name"),
            "ipv4": source_ip,
            "description": iface.get("description"),
        },
        "started_at": started_at,
        "finished_at": _utc(),
        "note": "Traffic generated on laptop (Ookla/curl); exits via UE-A mobile data over USB tether (not ADB).",
        **result,
    }
