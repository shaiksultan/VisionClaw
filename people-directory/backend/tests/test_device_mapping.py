import pytest
from pydantic import ValidationError

from mobile_ps.device_manager import assign_devices


def test_device_mapping_assigns_explicit_roles():
    assignment = assign_devices("SERIAL-A", "SERIAL-B")
    assert assignment.ue_a_serial == "SERIAL-A"
    assert assignment.ue_b_serial == "SERIAL-B"


def test_device_mapping_rejects_shared_serial():
    with pytest.raises(ValidationError, match="cannot share"):
        assign_devices("SAME", "SAME")
