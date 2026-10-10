import pytest

from mobile_ps.job_manager import JobManager
from models.job import JobCreate, JobState


@pytest.mark.parametrize("terminal", [JobState.STOPPED, JobState.COMPLETED])
def test_job_state_running_to_terminal(tmp_path, terminal):
    manager = JobManager(tmp_path)
    status = manager.create(JobCreate(ue_a_serial="A", ue_b_serial="B"))
    manager.transition(status.job_id, JobState.RUNNING)
    updated = manager.transition(status.job_id, terminal)
    assert updated.state == terminal


def test_terminal_job_cannot_restart(tmp_path):
    manager = JobManager(tmp_path)
    status = manager.create(JobCreate(ue_a_serial="A", ue_b_serial="B"))
    manager.transition(status.job_id, JobState.STOPPED)
    with pytest.raises(ValueError, match="invalid job state transition"):
        manager.transition(status.job_id, JobState.RUNNING)
