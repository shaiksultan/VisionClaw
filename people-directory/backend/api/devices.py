import asyncio
import os
import platform
import re
import statistics
import subprocess
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from mobile_ps.device_manager import DeviceManager, assign_devices
from mobile_ps.tools.network_state import network_registered
from models.job import ConnectivityRequest, ReadinessRequest

router = APIRouter()
manager = DeviceManager()


def _job_root() -> Path:
    configured = os.getenv("MOBILE_PS_JOB_ROOT")
    backend = Path(__file__).resolve().parents[1]
    return Path(configured).expanduser().resolve() if configured else (backend / ".." / "data" / "lab-jobs").resolve()


def host_ping(destination_ip: str, count: int = 4) -> dict[str, Any]:
    """Deterministic host-side ping to the monitoring server (not via UE)."""
    system = platform.system().lower()
    if system == "windows":
        cmd = ["ping", "-n", str(count), "-w", "2000", destination_ip]
    else:
        cmd = ["ping", "-c", str(count), "-W", "2", destination_ip]
    try:
        completed = subprocess.run(cmd, capture_output=True, text=True, timeout=max(10, count * 3))
    except Exception as exc:
        return {
            "destination_ip": destination_ip,
            "reachable": False,
            "latency_ms": None,
            "packet_loss_percent": None,
            "sent": count,
            "received": None,
            "error": str(exc),
            "raw": None,
        }

    output = (completed.stdout or "") + (completed.stderr or "")
    loss_match = re.search(r"(\d+(?:\.\d+)?)\s*%\s*(?:loss|packet loss)", output, re.I)
    if not loss_match:
        loss_match = re.search(r"Lost\s*=\s*\d+\s*\((\d+)%", output, re.I)
    received_match = re.search(r"(\d+)\s+received", output, re.I)
    sent_match = re.search(r"(\d+)\s+packets?\s+transmitted|Sent\s*=\s*(\d+)", output, re.I)
    rtts = [float(v) for v in re.findall(r"(?:time[=<]|Average\s*=\s*)(\d+(?:\.\d+)?)\s*ms", output, re.I)]
    if not rtts:
        rtts = [float(v) for v in re.findall(r"time[=<](\d+(?:\.\d+)?)\s*ms", output, re.I)]

    sent = count
    if sent_match:
        sent = int(sent_match.group(1) or sent_match.group(2))
    received = int(received_match.group(1)) if received_match else (len(rtts) if rtts else 0)
    loss = float(loss_match.group(1)) if loss_match else (
        round(100.0 * (sent - received) / sent, 2) if sent else None
    )
    latency = round(statistics.mean(rtts), 2) if rtts else None
    reachable = completed.returncode == 0 and (loss is None or loss < 100)
    return {
        "destination_ip": destination_ip,
        "reachable": reachable,
        "latency_ms": latency,
        "packet_loss_percent": loss,
        "sent": sent,
        "received": received,
        "rtt_min_ms": round(min(rtts), 2) if rtts else None,
        "rtt_avg_ms": latency,
        "rtt_max_ms": round(max(rtts), 2) if rtts else None,
        "error": None if reachable else "destination not reachable",
        "raw": output.strip() or None,
    }


@router.get("/devices")
async def devices() -> list[dict[str, Any]]:
    try:
        return await asyncio.to_thread(manager.list)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/devices/{serial}/status")
async def device_status(serial: str) -> dict[str, Any]:
    try:
        status = await asyncio.to_thread(manager.status, serial)
        return status.model_dump(mode="json")
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/readiness")
async def readiness(request: ReadinessRequest) -> dict[str, Any]:
    checks: list[dict[str, str]] = []

    def add(name: str, ok: bool, detail: str = "") -> None:
        checks.append({"name": name, "status": "PASS" if ok else "FAIL", "detail": detail})

    try:
        assign_devices(request.ue_a_serial, request.ue_b_serial)
        add("Different serials", True)
    except Exception as exc:
        add("Different serials", False, str(exc))

    ue_a_ok = False
    ue_b_ok = False
    ue_a_net = False
    ue_b_net = False
    ue_b_connected = False

    try:
        status_a = await asyncio.to_thread(manager.status, request.ue_a_serial)
        ue_a_ok = status_a.adb_state == "device"
        add("UE-A ADB", ue_a_ok, status_a.adb_state)
        registered, err = await asyncio.to_thread(network_registered, request.ue_a_serial)
        ue_a_net = registered is not None
        add("UE-A network state available", ue_a_net, err or ("registered" if registered else "not registered"))
    except Exception as exc:
        add("UE-A ADB", False, str(exc))
        add("UE-A network state available", False, str(exc))

    try:
        status_b = await asyncio.to_thread(manager.status, request.ue_b_serial)
        ue_b_ok = status_b.adb_state == "device"
        add("UE-B ADB", ue_b_ok, status_b.adb_state)
        registered, err = await asyncio.to_thread(network_registered, request.ue_b_serial)
        ue_b_net = registered is not None
        ue_b_connected = registered is True
        add("UE-B network state available", ue_b_net, err or "")
        add("UE-B network connected", ue_b_connected, "registered" if registered else (err or "not registered"))
    except Exception as exc:
        add("UE-B ADB", False, str(exc))
        add("UE-B network state available", False, str(exc))
        add("UE-B network connected", False, str(exc))

    ping = await asyncio.to_thread(host_ping, request.destination_ip, 3)
    add("Monitoring Server", bool(ping["reachable"]), ping.get("error") or f"{ping.get('latency_ms')} ms")

    root = _job_root()
    try:
        root.mkdir(parents=True, exist_ok=True)
        probe = root / ".write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        add("Job storage writable", True, str(root))
    except Exception as exc:
        add("Job storage writable", False, str(exc))

    add("Configuration valid", True, "V1 readiness")

    ready = all(c["status"] == "PASS" for c in checks if c["name"] != "UE-A network state available")
    # Soft: UE-A may be disconnected before airplane cycles; still require ADB + UE-B + server
    required = {"UE-A ADB", "UE-B ADB", "Different serials", "UE-B network connected", "Monitoring Server", "Job storage writable"}
    ready = all(c["status"] == "PASS" for c in checks if c["name"] in required)

    return {
        "ready": ready,
        "checks": checks,
        "monitoring": ping,
        "ue_a_ok": ue_a_ok,
        "ue_b_ok": ue_b_ok,
    }


@router.post("/connectivity-test")
async def connectivity_test(request: ConnectivityRequest) -> dict[str, Any]:
    result = await asyncio.to_thread(host_ping, request.destination_ip, request.count)
    return {
        "destination_ip": request.destination_ip,
        "host": request.destination_ip,
        "server_reachable": result["reachable"],
        "latency_ms": result["latency_ms"],
        "packet_loss_percent": result["packet_loss_percent"],
        **result,
        "results": {
            "MONITOR": {
                "reachable": result["reachable"],
                "output": result.get("raw"),
                "error": result.get("error"),
            }
        },
    }
