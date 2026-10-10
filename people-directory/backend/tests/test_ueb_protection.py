import pytest

from mobile_ps.tools.airplane import ProtectedDeviceError, set_airplane_mode


def test_ueb_protection_rejects_airplane_on_protected_serial():
    with pytest.raises(ProtectedDeviceError, match="protected UE-B"):
        set_airplane_mode("UE-B-SERIAL", True, "UE-B-SERIAL", settle_seconds=0)
