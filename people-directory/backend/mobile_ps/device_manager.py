import re

from models.device import DeviceAssignment, DeviceStatus

from .tools.adb import AdbDevice, getprop, list_devices, shell
from .tools.network_state import collect_network_status


def assign_devices(ue_a_serial: str, ue_b_serial: str) -> DeviceAssignment:
    return DeviceAssignment(ue_a_serial=ue_a_serial, ue_b_serial=ue_b_serial)


class DeviceManager:
    def list(self) -> list[dict]:
        return [
            {
                "serial": device.serial,
                "state": device.state,
                **device.properties,
            }
            for device in list_devices()
        ]

    def _find(self, serial: str) -> AdbDevice:
        for device in list_devices():
            if device.serial == serial:
                return device
        raise LookupError(f"ADB device not found: {serial}")

    def status(self, serial: str) -> DeviceStatus:
        device = self._find(serial)
        errors: dict[str, str] = {}

        def safe_getprop(name: str, key: str) -> str | None:
            try:
                value = getprop(serial, name)
                if value is None:
                    errors[key] = f"{name} returned no value"
                return value
            except Exception as exc:
                errors[key] = str(exc)
                return None

        model = safe_getprop("ro.product.model", "model")
        manufacturer = safe_getprop("ro.product.manufacturer", "manufacturer")
        android = safe_getprop("ro.build.version.release", "android")
        battery_percent = None
        try:
            battery = shell(serial, "dumpsys", "battery")
            match = re.search(r"level:\s*(\d+)", battery)
            if match:
                battery_percent = int(match.group(1))
            else:
                errors["battery_percent"] = "battery level not found"
        except Exception as exc:
            errors["battery_percent"] = str(exc)

        network = collect_network_status(serial)
        errors.update(network.pop("errors"))
        return DeviceStatus(
            serial=serial,
            adb_state=device.state,
            manufacturer=manufacturer,
            model=model,
            android=android,
            battery_percent=battery_percent,
            errors=errors,
            **network,
        )
