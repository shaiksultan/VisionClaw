from mobile_ps.tools.web_test import run_web_test
from mobile_ps.tools.speed_test import run_speed_test


def test_web_requires_tether_ip():
    result = run_web_test(["https://example.com"], tether_interface=None, serial="UEA")
    assert result["mocked"] is False
    assert result["success"] is False
    assert result["path"] == "laptop_via_ue_a_usb_tether"
    assert "tether" in (result.get("error") or "").lower()


def test_speed_requires_tether_ip():
    result = run_speed_test(tether_interface=None, serial="UEA")
    assert result["mocked"] is False
    assert result["success"] is False
    assert result["path"] == "laptop_via_ue_a_usb_tether"
    assert result["download_mbps"] is None
