# LAB Vision AI — Install & Use Guide (Demo)

Boss-ready package for the **UAELAB Mission Control** demo: AI glasses / phone agents, live Expert Engineer calls, inventory, knowledge, tickets, Mobile PS, and digital capture.

---

## 1. Where the code lives (GitHub)

| Repo | URL |
|------|-----|
| **Working fork (latest demo branch)** | https://github.com/shaiksultan/VisionClaw |
| **Demo branch (all recent Mission Control + Expert Engineer work)** | https://github.com/shaiksultan/VisionClaw/tree/cursor/expert-engineer-audio-mission-control |
| **README (about Lab Vision AI)** | https://github.com/shaiksultan/VisionClaw/blob/cursor/expert-engineer-audio-mission-control/README.md |
| Upstream org mirror | https://github.com/Intent-Lab/VisionClaw |

**Clone the demo branch:**

```powershell
git clone -b cursor/expert-engineer-audio-mission-control https://github.com/shaiksultan/VisionClaw.git
cd VisionClaw
```

---

## 2. What you get

### Mission Control (web) — `people-directory/` · port **8090**
Local dashboard + SQLite API that powers the lab agents:

1. **Lab Inventory Agent** — find gear / counts  
2. **Lab Knowledge Agent** — procedures & how-tos  
3. **Mobile PS / Lab Test Agent** — dual-UE validation (UI :5173, API :8100)  
4. **Evidence Ticket Agent** — screenshot / video tickets  
5. **Lab Expert Engineer** — live WebRTC support from glasses → PC / Expert app  
6. **Digital Capture (ab-twin)** — walk-through capture  

### Android apps
| App | Package | Role |
|-----|---------|------|
| **Lab Vision AI** | `com.meta.wearable.dat.externalsampleapps.cameraaccess` | Glasses / phone AI (Gemini Live + agents) |
| **Lab Expert** | `com.labvision.expert` | Call-receiving app (rings on Expert Engineer request) |

### Optional
| Service | Port | Role |
|---------|------|------|
| OpenClaw gateway | **18789** | Tool routing / chat skills |
| WebRTC signaling | hosted / Fly | Expert Engineer live video rooms |

---

## 3. Prerequisites

| Tool | Notes |
|------|--------|
| **Windows 10/11 PC** | Same Wi‑Fi as phones / glasses companion |
| **Node.js 22.5+** (24 recommended) | Mission Control + Vite |
| **Python 3.10+** | Mobile PS FastAPI (`backend/`) |
| **Android Studio / JDK 17+** | Build Lab Vision AI + Lab Expert |
| **ADB** | Install APKs on phones |
| **Gemini API key** | https://aistudio.google.com/apikey |
| **Meta Wearables DAT SDK access** (Lab Vision AI) | GitHub Packages token in `samples/CameraAccessAndroid/local.properties` as `github_token=…` |

---

## 4. Install Mission Control (PC)

```powershell
cd VisionClaw\people-directory
npm install
npm start
```

Open: `http://localhost:8090`  
From phones: `http://YOUR_PC_WIFI_IP:8090`

Database file: `people-directory/data/people.db`

### Mobile PS (optional but used in demos)

```powershell
# Terminal A — API
cd VisionClaw\people-directory\backend
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8100

# Terminal B — UI
cd VisionClaw\people-directory\frontend
npm install
npm run dev
```

- API: `http://YOUR_PC_IP:8100`  
- UI: `http://YOUR_PC_IP:5173` (also embedded in Mission Control)

### OpenClaw (optional)

```powershell
openclaw gateway --port 18789
```

---

## 5. Install Android apps

### A) Lab Vision AI (main demo app)

```powershell
cd VisionClaw\samples\CameraAccessAndroid
```

1. Copy secrets:

```powershell
copy app\src\main\java\com\meta\wearable\dat\externalsampleapps\cameraaccess\Secrets.kt.example `
     app\src\main\java\com\meta\wearable\dat\externalsampleapps\cameraaccess\Secrets.kt
```

2. Edit `Secrets.kt`:

```kotlin
const val peopleDirectoryURL = "http://YOUR_PC_IP:8090"
const val geminiAPIKey = "YOUR_GEMINI_API_KEY"
const val openClawHost = "http://YOUR_PC_IP"   // or hostname
const val openClawPort = 18789
const val openClawGatewayToken = "YOUR_TOKEN"  // if using OpenClaw
const val webrtcSignalingURL = "wss://YOUR_SIGNALING_SERVER"
```

3. Ensure `local.properties` has:

```properties
sdk.dir=C:\\Users\\YOU\\AppData\\Local\\Android\\Sdk
github_token=YOUR_GITHUB_TOKEN_WITH_PACKAGES_READ
```

4. Build & install:

```powershell
.\gradlew.bat :app:installDebug
```

### B) Lab Expert (call receiver)

```powershell
cd VisionClaw\samples\LabExpert
.\gradlew.bat :app:installDebug
```

On first launch, set **Mission Control base URL** to `http://YOUR_PC_IP:8090`  
(Default in source may be `http://192.168.0.121:8090` — change if your PC IP differs.)

---

## 6. Quick restart (all demo services)

From a PowerShell session on the demo PC:

| Service | Start command | Port |
|---------|---------------|------|
| Mission Control | `cd people-directory; node server.js` | 8090 |
| Mobile PS API | `cd people-directory\backend; python -m uvicorn main:app --host 0.0.0.0 --port 8100` | 8100 |
| Mobile PS UI | `cd people-directory\frontend; npx vite --host 0.0.0.0 --port 5173` | 5173 |
| OpenClaw | `openclaw gateway --port 18789` | 18789 |

Health check: `http://127.0.0.1:8090/api/health` → `{"ok":true,"demos":6}`

---

## 7. How to use (demo script)

1. **PC:** Start Mission Control (+ Mobile PS / OpenClaw as needed). Open Mission Control in Chrome.  
2. **Phone A — Lab Vision AI:** Connect glasses (or use Phone live). Tap **AI ON**.  
3. **Try voice prompts:**
   - *“Where is the RF shield box?”* → Inventory  
   - *“Explain the Packet Core upgrade procedure.”* → Knowledge  
   - *“Create a ticket for this alarm.”* → Evidence ticket  
   - *“Call the Lab Expert Engineer.”* → Live support  
   - *“Play music”* / *“BBC radio”* → Audio streams  
4. **Phone B — Lab Expert** (or Mission Control Support page): Accept the ringing Expert Engineer call; join live glasses video.  
5. **End call** from Mission Control or Lab Expert → evidence ticket stays open for review.  
6. **Analytics / chat:** Mission Control sidebar chatbot can answer inventory, tickets, Expert Engineer stats, charts.

### Audio notes (Lab Vision AI)
- With **Bluetooth glasses on**, AI voice prefers glasses media output.  
- With **Bluetooth off**, AI replies play on the **phone loudspeaker** (media route). Raise media volume.  
- Music / BBC speak a short “connecting…” line, then stream audio.

---

## 8. Project map

```text
VisionClaw/
├── DEMO_INSTALL_AND_USE.md          ← this guide
├── people-directory/                ← Mission Control (Node :8090)
│   ├── public/                      ← dashboard UI
│   ├── server.js
│   ├── backend/                     ← Mobile PS FastAPI :8100
│   └── frontend/                    ← Mobile PS Vite :5173
├── samples/
│   ├── CameraAccessAndroid/         ← Lab Vision AI app
│   └── LabExpert/                   ← Expert Engineer receiver app
└── README.md                        ← upstream VisionClaw overview
```

More detail:
- `people-directory/README.md` — APIs & agents  
- `people-directory/MOBILE_PS.md` — Mobile PS validation  
- `people-directory/AB_TWIN.md` — Digital capture  

---

## 9. Troubleshooting

| Issue | Fix |
|-------|-----|
| Phone can’t open Mission Control | Same Wi‑Fi; Windows Firewall allow Node on 8090; use PC LAN IP not `localhost` |
| Expert call rings but no video | Wait for glasses room code; keep Video on; check WebRTC signaling URL |
| Lab Expert never rings | Base URL must match PC IP:8090; Mission Control must be running |
| Gemini silent on phone (BT off) | Use latest app build; raise **media** volume |
| Gradle can’t resolve `mwdat-*` | Valid GitHub Packages token in `CameraAccessAndroid/local.properties` |

---

## 10. Security / demo hygiene

- Do **not** commit `Secrets.kt`, `local.properties` tokens, or `.env` files.  
- Gemini / OpenClaw / GitHub tokens stay on the demo machine only.  
- For a shared boss review, share the **GitHub branch link** above + this document; install keys locally per section 5.

---

*Document version: 2026-11-04 · Branch: `cursor/expert-engineer-audio-mission-control`*
