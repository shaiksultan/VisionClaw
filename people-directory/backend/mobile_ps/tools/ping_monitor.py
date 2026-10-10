import asyncio
from pathlib import Path
from typing import Awaitable, Callable

from .adb import run_adb
from .evidence import append_jsonl, utc_now


class PingMonitor:
    def __init__(
        self,
        serial: str,
        output_path: Path,
        on_interruption: Callable[[str], Awaitable[None]],
        host: str = "8.8.8.8",
        interval_seconds: float = 1.0,
    ):
        self.serial = serial
        self.output_path = output_path
        self.on_interruption = on_interruption
        self.host = host
        self.interval_seconds = interval_seconds
        self._stop = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self._was_reachable: bool | None = None

    def start(self) -> None:
        if self._task is not None:
            raise RuntimeError("ping monitor already started")
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            await self._task

    async def _run(self) -> None:
        while not self._stop.is_set():
            try:
                result = await asyncio.to_thread(
                    run_adb,
                    self.serial,
                    "shell",
                    "ping",
                    "-c",
                    "1",
                    "-W",
                    "2",
                    self.host,
                    timeout=5,
                    check=False,
                )
                reachable = result.returncode == 0
                reason = None if reachable else (result.stderr or result.stdout or "ping failed").strip()
            except Exception as exc:
                reachable = False
                reason = str(exc)
            append_jsonl(
                self.output_path,
                {
                    "timestamp": utc_now(),
                    "serial": self.serial,
                    "host": self.host,
                    "reachable": reachable,
                    "error": reason,
                },
            )
            if self._was_reachable is not False and not reachable:
                await self.on_interruption(reason or "ping interrupted")
            self._was_reachable = reachable
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.interval_seconds)
            except TimeoutError:
                pass
