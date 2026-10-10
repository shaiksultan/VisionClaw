from typing import Any

from fastapi import APIRouter, HTTPException, Request

from mobile_ps.job_manager import JobManager
from models.job import JobCreate

router = APIRouter()


def _manager(request: Request) -> JobManager:
    return request.app.state.job_manager


@router.post("/jobs", status_code=201)
async def create_job(config: JobCreate, request: Request) -> dict[str, Any]:
    try:
        return _manager(request).create_and_start(config).model_dump(mode="json")
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/jobs")
async def list_jobs(request: Request) -> list[dict[str, Any]]:
    return [job.model_dump(mode="json") for job in _manager(request).list()]


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, request: Request) -> dict[str, Any]:
    try:
        return _manager(request).result(job_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/jobs/{job_id}/cycles")
async def get_cycles(job_id: str, request: Request) -> list[dict[str, Any]]:
    try:
        return _manager(request).cycles(job_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/jobs/{job_id}/events")
async def get_events(job_id: str, request: Request) -> list[dict[str, Any]]:
    try:
        return _manager(request).events(job_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/jobs/{job_id}/anomalies")
async def get_anomalies(job_id: str, request: Request) -> list[dict[str, Any]]:
    try:
        return _manager(request).anomalies(job_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/jobs/{job_id}/stop")
async def stop_job(job_id: str, request: Request) -> dict[str, Any]:
    try:
        return _manager(request).stop(job_id).model_dump(mode="json")
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
