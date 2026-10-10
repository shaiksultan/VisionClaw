from mobile_ps.runner import aggregate_results


def test_result_aggregation_from_cycles():
    cycles = [
        {"status": "COMPLETED", "attach": {"attach_seconds": 4.0}},
        {"status": "COMPLETED", "attach": {"attach_seconds": 6.0}},
        {"status": "FAILED", "attach": {"attach_seconds": None, "error": "timeout"}},
    ]
    summary = aggregate_results(cycles)
    assert summary["cycle_count"] == 3
    assert summary["completed_cycles"] == 2
    assert summary["failed_cycles"] == 1
    assert summary["attach_success_count"] == 2
    assert summary["attach_success_rate"] == pytest.approx(2 / 3)
    assert summary["mean_attach_seconds"] == 5.0


def test_empty_aggregation_uses_null_measurements():
    summary = aggregate_results([])
    assert summary["attach_success_rate"] is None
    assert summary["mean_attach_seconds"] is None
    assert summary["errors"] == ["no cycles available for aggregation"]


import pytest
