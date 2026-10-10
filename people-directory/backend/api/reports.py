from pathlib import Path
from typing import Any, Callable

from fastapi import APIRouter, HTTPException, Request

from mobile_ps.reporting import create_excel_report, create_pdf_report, create_pptx_report

router = APIRouter()


def _create(
    job_id: str,
    request: Request,
    generator: Callable[[Path], Path],
) -> dict[str, Any]:
    try:
        root = request.app.state.job_manager.job_path(job_id)
        output = generator(root)
        return {
            "job_id": job_id,
            "path": str(output.resolve()),
            "placeholder": True,
            "message": "V4 not fully implemented; generated from result.json only",
        }
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (FileNotFoundError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=409, detail=f"result not ready: {exc}") from exc


@router.post("/jobs/{job_id}/reports/excel")
async def excel_report(job_id: str, request: Request) -> dict[str, Any]:
    return _create(job_id, request, create_excel_report)


@router.post("/jobs/{job_id}/reports/pdf")
async def pdf_report(job_id: str, request: Request) -> dict[str, Any]:
    return _create(job_id, request, create_pdf_report)


@router.post("/jobs/{job_id}/reports/pptx")
async def pptx_report(job_id: str, request: Request) -> dict[str, Any]:
    return _create(job_id, request, create_pptx_report)
