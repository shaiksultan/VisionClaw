from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.devices import router as devices_router
from api.jobs import router as jobs_router
from api.reports import router as reports_router
from mobile_ps.job_manager import JobManager

app = FastAPI(title="Mobile PS Packet Core Upgrade Validation", version="1.0.0")
app.state.job_manager = JobManager()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(devices_router, prefix="/api/mobile-ps", tags=["devices"])
app.include_router(jobs_router, prefix="/api/mobile-ps", tags=["jobs"])
app.include_router(reports_router, prefix="/api/mobile-ps", tags=["reports"])


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8100, reload=False)
