import asyncio
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any, Callable

from models.anomaly import Anomaly
from models.cycle import CycleResult
from models.job import JobCreate

from .tools.airplane import set_airplane_mode
from .tools.attach_test import wait_for_attach
from .tools.evidence import record_event, write_json_atomic
from .tools.network_state import network_registered
from .tools.ping_monitor import PingMonitor
from .tools.speed_test import run_speed_test
from .tools.usb_tether import TetherError, ensure_tether_ready
from .tools.volte_test import run_volte_test
from .tools.web_test import run_web_test


def aggregate_results(cycles: list[dict[str, Any]]) -> dict[str, Any]:
    completed = [cycle for cycle in cycles if cycle.get("status") == "COMPLETED"]
    attach_values = [
        cycle.get("attach", {}).get("attach_seconds")
        for cycle in completed
        if isinstance(cycle.get("attach", {}).get("attach_seconds"), (int, float))
    ]
    failures = len([cycle for cycle in cycles if cycle.get("status") == "FAILED"])
    return {
        "cycle_count": len(cycles),
        "completed_cycles": len(completed),
        "failed_cycles": failures,
        "attach_success_count": len(attach_values),
        "attach_success_rate": (len(attach_values) / len(cycles)) if cycles else None,
        "mean_attach_seconds": round(mean(attach_values), 3) if attach_values else None,
        "errors": [] if cycles else ["no cycles available for aggregation"],
    }


class JobRunner:
    def __init__(
        self,
        job_id: str,
        root: Path,
        config: JobCreate,
        stop_event: asyncio.Event,
        persist_status: Callable[[str, int, str | None], None],
    ):
        self.job_id = job_id
        self.root = root
        self.config = config
        self.stop_event = stop_event
        self.persist_status = persist_status
        self.events_path = root / "events.jsonl"
        self.anomalies_path = root / "anomalies.json"
        self.anomalies: list[dict[str, Any]] = []

    def _event(self, kind: str, **details: Any) -> None:
        record_event(self.events_path, kind, **details)

    async def _anomaly(self, message: str, cycle_number: int | None = None) -> None:
        anomaly = Anomaly(
            severity="CRITICAL",
            kind="PING_INTERRUPTION",
            message=message,
            cycle_number=cycle_number,
        ).model_dump(mode="json")
        self.anomalies.append(anomaly)
        write_json_atomic(self.anomalies_path, self.anomalies)
        self._event("ANOMALY_RECORDED", anomaly=anomaly)

    async def _verify_disconnected(self) -> dict[str, Any]:
        registered, error = await asyncio.to_thread(network_registered, self.config.ue_a_serial)
        if error:
            return {"disconnected": None, "error": error}
        return {
            "disconnected": registered is False,
            "error": None if registered is False else "UE-A remained network registered",
        }

    async def _cycle(self, number: int) -> dict[str, Any]:
        cycle = CycleResult(cycle_number=number)
        cycle_path = self.root / "cycles" / f"cycle-{number:04d}.json"
        write_json_atomic(cycle_path, cycle.model_dump(mode="json"))
        try:
            await asyncio.to_thread(
                set_airplane_mode,
                self.config.ue_a_serial,
                True,
                self.config.ue_b_serial,
            )
            disconnect = await self._verify_disconnected()
            cycle.steps.append({"name": "airplane_on_start", "success": disconnect["disconnected"], **disconnect})
            write_json_atomic(cycle_path, cycle.model_dump(mode="json"))
            self._event("STEP_COMPLETED", cycle=number, step="airplane_on_start", result=disconnect)

            if self.stop_event.is_set():
                raise asyncio.CancelledError

            await asyncio.to_thread(
                set_airplane_mode,
                self.config.ue_a_serial,
                False,
                self.config.ue_b_serial,
            )
            cycle.steps.append({"name": "airplane_off", "success": True})
            write_json_atomic(cycle_path, cycle.model_dump(mode="json"))
            self._event("STEP_COMPLETED", cycle=number, step="airplane_off")

            cycle.attach = await wait_for_attach(
                self.config.ue_a_serial,
                self.config.attach_timeout_seconds,
                self.stop_event,
            )
            cycle.steps.append({"name": "attach", "success": cycle.attach.get("attach_seconds") is not None})
            write_json_atomic(cycle_path, cycle.model_dump(mode="json"))
            self._event("STEP_COMPLETED", cycle=number, step="attach", result=cycle.attach)

            need_tether = bool(
                self.config.run_web_test
                or self.config.web_test
                or self.config.run_speed_test
                or self.config.speed_test
            )
            tether_info = None
            if need_tether:
                try:
                    tether_info = await asyncio.to_thread(ensure_tether_ready, self.config.ue_a_serial)
                    cycle.steps.append(
                        {
                            "name": "usb_tether",
                            "success": True,
                            "path": "laptop_via_ue_a_usb_tether",
                            "interface": tether_info.get("interface"),
                        }
                    )
                    self._event("USB_TETHER_READY", cycle=number, interface=tether_info.get("interface"))
                except TetherError as exc:
                    tether_info = {"interface": None, "error": str(exc)}
                    cycle.steps.append({"name": "usb_tether", "success": False, "error": str(exc)})
                    self._event("USB_TETHER_FAILED", cycle=number, error=str(exc))
                write_json_atomic(cycle_path, cycle.model_dump(mode="json"))

            iface = (tether_info or {}).get("interface")
            if self.config.run_web_test or self.config.web_test:
                cycle.web = await asyncio.to_thread(
                    run_web_test,
                    self.config.websites,
                    tether_interface=iface,
                    serial=self.config.ue_a_serial,
                )
                write_json_atomic(cycle_path, cycle.model_dump(mode="json"))
                self._event("WEB_COMPLETE", cycle=number, mocked=False, path="laptop_via_ue_a_usb_tether")
            if self.config.run_speed_test or self.config.speed_test:
                cycle.speed = await asyncio.to_thread(
                    run_speed_test,
                    tether_interface=iface,
                    serial=self.config.ue_a_serial,
                )
                write_json_atomic(cycle_path, cycle.model_dump(mode="json"))
                self._event("SPEED_COMPLETE", cycle=number, mocked=False, path="laptop_via_ue_a_usb_tether")
            if self.config.run_volte_ab or self.config.run_volte_ba or self.config.volte_test:
                cycle.volte = run_volte_test(
                    self.config.ue_a_serial,
                    self.config.ue_b_serial,
                    call_duration_seconds=self.config.call_duration_seconds,
                    run_ab=bool(self.config.run_volte_ab or self.config.volte_test),
                    run_ba=bool(self.config.run_volte_ba or self.config.volte_test),
                )
                write_json_atomic(cycle_path, cycle.model_dump(mode="json"))
                self._event("VOLTE_COMPLETE", cycle=number, mocked=True)

            await asyncio.to_thread(
                set_airplane_mode,
                self.config.ue_a_serial,
                True,
                self.config.ue_b_serial,
            )
            cycle.steps.append({"name": "airplane_on_end", "success": True})
            cycle.status = "COMPLETED"
        except asyncio.CancelledError:
            cycle.status = "STOPPED"
            cycle.error = "job stop requested"
        except Exception as exc:
            cycle.status = "FAILED"
            cycle.error = str(exc)
        cycle.completed_at = datetime.now(timezone.utc)
        payload = cycle.model_dump(mode="json")
        write_json_atomic(cycle_path, payload)
        self._event("CYCLE_COMPLETED", cycle=number, status=cycle.status, error=cycle.error)
        return payload

    async def run(self) -> tuple[str, list[dict[str, Any]], str | None]:
        cycles: list[dict[str, Any]] = []
        monitor = PingMonitor(
            self.config.ue_b_serial,
            self.root / "raw" / "ping" / "ue-b.jsonl",
            self._anomaly,
            host=self.config.destination_ip,
            interval_seconds=float(self.config.ping_interval_seconds),
        )
        monitor.start()
        self._event("PING_MONITOR_STARTED", serial=self.config.ue_b_serial)
        error = None
        try:
            for number in range(1, self.config.cycles + 1):
                if self.stop_event.is_set():
                    break
                result = await self._cycle(number)
                cycles.append(result)
                self.persist_status("RUNNING", len(cycles), None)
                if result["status"] == "STOPPED":
                    break
                if self.config.cycle_interval_seconds and number < self.config.cycles:
                    try:
                        await asyncio.wait_for(
                            self.stop_event.wait(),
                            timeout=self.config.cycle_interval_seconds,
                        )
                    except TimeoutError:
                        pass
        except Exception as exc:
            error = str(exc)
        finally:
            await monitor.stop()
            self._event("PING_MONITOR_STOPPED", serial=self.config.ue_b_serial)

        state = "FAILED" if error else ("STOPPED" if self.stop_event.is_set() else "COMPLETED")
        result = {
            "job_id": self.job_id,
            "state": state,
            "config": self.config.model_dump(mode="json"),
            "summary": aggregate_results(cycles),
            "cycles": cycles,
            "anomalies": self.anomalies,
            "error": error,
        }
        write_json_atomic(self.root / "result.json", result)
        return state, cycles, error
