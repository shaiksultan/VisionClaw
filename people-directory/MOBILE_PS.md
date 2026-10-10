# Mobile PS Packet Core Upgrade Validation (V1)

Deterministic dual-UE Android validation for packet core upgrades.
**No Hermes. No LLM in the test path.**

## Stack

| Layer | Port | Path |
|-------|------|------|
| FastAPI backend | 8100 | `backend/` |
| React Mission Control UI | 5173 | `frontend/` |
| Job evidence | — | `data/lab-jobs/<JOB_ID>/` |
| Lab AI Mission Control (Node) | 8090 | embeds Mobile PS via iframe |

## Start

```powershell
# Terminal 1 — API
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8100

# Terminal 2 — UI
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 or Mission Control → **Mobile PS** / agent card **04**.

## V1 coverage

- ADB device discovery + UE-A / UE-B assignment (distinct serials)
- Live device status
- Monitoring server connectivity (host ping)
- Readiness checks (JSON with PASS/FAIL)
- Job create `PS-YYYYMMDD-HHMMSS`, durable folders, events.jsonl, cycle JSON, result.json
- Continuous UE-B ping monitor (UE-B never put in Airplane Mode)
- UE-A airplane ON/OFF + attach timing
- **Web + Speed over USB tether**: laptop generates HTTP/Ookla (or curl download) traffic bound to the UE-A RNDIS interface — not ADB browser/speedtest on the phone
- Start / graceful Stop
- Live job polling

### Web / Speed path

```
Laptop curl / Ookla Speedtest
        |
        v
UE-A USB tether (RNDIS) NIC on laptop
        |
        v
UE-A mobile data (packet core under test)
```

ADB is only used to enable RNDIS tethering on UE-A after attach. Measurement traffic never uses `adb shell`.

## Mocked until later phases

- **V3** VoLTE A→B / B→A (still mocked)
- **V4** Excel / PDF / PPTX (stubs write placeholder files from `result.json`)

## Safety

Airplane Mode commands always use `adb -s <serial>` and refuse UE-B's serial.
