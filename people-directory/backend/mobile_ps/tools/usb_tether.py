"""USB tethering helpers.

Web and Speed tests generate traffic on the *laptop*, routed through UE-A's
mobile data via USB tether (RNDIS). ADB is only used to enable tethering /
read status — never to fetch pages or run Ookla on the phone.
"""

from __future__ import annotations

import platform
import re
import subprocess
import time
from typing import Any

from .adb import AdbError, run_adb, shell


class TetherError(RuntimeError):
    pass


def enable_usb_tether(serial: str) -> dict[str, Any]:
    """Ask UE-A to present RNDIS USB tethering. Does not generate test traffic."""
    attempts: list[dict[str, Any]] = []
    commands = [
        ("svc", ["svc", "usb", "setFunctions", "rndis"]),
        ("setprop", ["setprop", "sys.usb.config", "rndis,adb"]),
    ]
    last_error = None
    for name, args in commands:
        try:
            run_adb(serial, "shell", *args, check=False, timeout=15)
            attempts.append({"method": name, "ok": True})
            last_error = None
            break
        except AdbError as exc:
            attempts.append({"method": name, "ok": False, "error": str(exc)})
            last_error = str(exc)
    # Give Windows time to enumerate the Remote NDIS adapter
    time.sleep(2.5)
    iface = discover_tether_interface()
    return {
        "serial": serial,
        "enabled_attempted": True,
        "attempts": attempts,
        "error": last_error,
        "interface": iface,
    }


def discover_tether_interface() -> dict[str, Any] | None:
    """Find a likely USB-tether IPv4 interface on this laptop."""
    system = platform.system().lower()
    if system == "windows":
        return _discover_windows()
    return _discover_unix()


def _discover_windows() -> dict[str, Any] | None:
    ps = r"""
$adapters = Get-NetAdapter -ErrorAction SilentlyContinue |
  Where-Object { $_.Status -eq 'Up' -and (
    $_.InterfaceDescription -match 'NDIS|Remote NDIS|UsbNcm|RNDIS|Mobile|Tether|Samsung|Xiaomi|Huawei|OnePlus|Android' -or
    $_.Name -match 'Ethernet|Local Area Connection'
  )}
foreach ($a in $adapters) {
  $ip = Get-NetIPAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '169.254.*' } |
    Select-Object -First 1
  if ($ip) {
    Write-Output ("{0}|{1}|{2}|{3}" -f $a.Name, $a.InterfaceDescription, $a.ifIndex, $ip.IPAddress)
  }
}
"""
    try:
        completed = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps],
            capture_output=True,
            text=True,
            timeout=20,
            encoding="utf-8",
            errors="replace",
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    lines = [ln.strip() for ln in (completed.stdout or "").splitlines() if ln.strip()]
    # Prefer adapters that look like phone tether over generic Ethernet
    ranked: list[tuple[int, dict[str, Any]]] = []
    for line in lines:
        parts = line.split("|")
        if len(parts) != 4:
            continue
        name, desc, ifindex, ip = parts
        score = 0
        blob = f"{name} {desc}".lower()
        if any(k in blob for k in ("ndis", "rndis", "usbncm", "tether", "android", "samsung", "xiaomi")):
            score += 10
        if "ethernet" in blob:
            score += 1
        ranked.append(
            (
                score,
                {
                    "name": name,
                    "description": desc,
                    "ifindex": int(ifindex),
                    "ipv4": ip,
                    "platform": "windows",
                },
            )
        )
    if not ranked:
        return None
    ranked.sort(key=lambda item: item[0], reverse=True)
    best = ranked[0]
    # Require a tether-like score unless only one candidate exists
    if best[0] < 10 and len(ranked) > 1:
        return None
    return best[1]


def _discover_unix() -> dict[str, Any] | None:
    try:
        completed = subprocess.run(
            ["ip", "-4", "-o", "addr", "show", "up"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    for line in completed.stdout.splitlines():
        # 3: enx...    inet 192.168.42.100/24 ...
        if not re.search(r"\benx|\busb|\brndis|\btether", line, re.I):
            continue
        match = re.search(r"^\d+:\s+(\S+)\s+inet\s+(\d+\.\d+\.\d+\.\d+)", line)
        if match:
            return {
                "name": match.group(1),
                "description": match.group(1),
                "ifindex": None,
                "ipv4": match.group(2),
                "platform": "unix",
            }
    return None


def ensure_tether_ready(serial: str, *, settle_seconds: float = 2.0) -> dict[str, Any]:
    """Enable tether on UE-A and resolve the laptop interface used for traffic."""
    enable_result = enable_usb_tether(serial)
    time.sleep(settle_seconds)
    iface = discover_tether_interface() or enable_result.get("interface")
    if not iface or not iface.get("ipv4"):
        raise TetherError(
            "USB tether interface not found on laptop. "
            "Enable USB tethering on UE-A and confirm Windows shows a Remote NDIS adapter."
        )
    # Sanity: phone should still be reachable over ADB after rndis,adb
    try:
        shell(serial, "echo", "ok", timeout=5)
        adb_ok = True
        adb_error = None
    except Exception as exc:  # noqa: BLE001
        adb_ok = False
        adb_error = str(exc)
    return {
        "serial": serial,
        "adb_ok": adb_ok,
        "adb_error": adb_error,
        "interface": iface,
        "path": "laptop_via_ue_a_usb_tether",
        "enable": enable_result,
    }
