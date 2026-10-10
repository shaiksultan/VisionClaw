# ab-twin — Digital Twin Generator from AI-Glasses Video

Converts a Meta Ray-Ban Gen 2 walk-through video (target 3K) into a navigable
3D Gaussian Splatting lab twin, viewable in the browser.

## Prefer existing OSS (preflight)

| Engine | Use when |
|--------|----------|
| **[Nerfstudio Splatfacto](https://docs.nerf.studio/nerfology/methods/splat.html)** + [gsplat](https://github.com/nerfstudio-project/gsplat) | Posed / COLMAP-friendly captures |
| **[LongSplat](https://github.com/NVlabs/LongSplat)** | Casual long unposed glasses video (best match for free walk-throughs) |
| `demo` (default) | No GPU tools yet — extracts frames + preview point cloud so the portal flow works |

Do **not** reimplement Gaussian training from scratch. Wire Nerfstudio or LongSplat when GPUs are available.

## Flow

```text
Ray-Ban Gen 2 (3K walk-through)
        │
        ▼
Mission Control  ·  agent 07 ab-twin
POST /api/twins  { video: data:video/mp4;base64,... }
        │
        ▼
data/lab-twins/TWIN-YYYYMMDD-HHMMSS/
  input/capture.mp4
  frames/*.jpg          ← ffmpeg
  exports/point_cloud.ply
  exports/viewer.json
  status.json
        │
        ▼
Browser viewer  /twin-viewer.html?id=TWIN-…
```

## Voice / demo prompt

> “Create digital twin — capture the lab walk-through video and build the twin.”

## API

| Method | Path |
|--------|------|
| GET | `/api/twins` |
| POST | `/api/twins` |
| GET | `/api/twins/{id}` |
| GET | `/api/twins/{id}/frames` |
| GET | `/api/twins/{id}/frames/{name}` |
| GET | `/api/twins/{id}/exports/{file}` |

## Engines

```powershell
# Preview (default) — frames + navigable preview cloud
$env:TWIN_ENGINE = "demo"

# Photoreal 3DGS (requires Nerfstudio + CUDA)
$env:TWIN_ENGINE = "nerfstudio"
# optional: $env:TWIN_NS_ITERS = "3000"

# Planned: LongSplat path
$env:TWIN_ENGINE = "longsplat"
```

## Open

- Portal: http://localhost:8090 → **ab-twin** agent or nav
- Viewer: http://localhost:8090/twin-viewer.html?id=TWIN-…
