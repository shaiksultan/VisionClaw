# UAE Lab Vision AI — Install & Use Guide

Boss-ready package for **UAE Lab Vision AI / Mission Control**: AI glasses & phone agents, live Expert Engineer calls, inventory, knowledge, tickets, Mobile PS, and digital capture.

---

## 1. Where the code lives (GitHub)

| | URL |
|---|-----|
| **Repository** | https://github.com/shaiksultan/VisionClaw |
| **Branch** | https://github.com/shaiksultan/VisionClaw/tree/uae-lab-vision-ai |
| **README** | https://github.com/shaiksultan/VisionClaw/blob/uae-lab-vision-ai/README.md |
| **APKs** | [`apks/`](https://github.com/shaiksultan/VisionClaw/tree/uae-lab-vision-ai/apks) · [Releases](https://github.com/shaiksultan/VisionClaw/releases) |

```powershell
git clone -b uae-lab-vision-ai https://github.com/shaiksultan/VisionClaw.git
cd VisionClaw
```

---

## 2. Fast path — install APKs only

| App | Download |
|-----|----------|
| **UAE Lab Vision AI** | [GitHub Releases](https://github.com/shaiksultan/VisionClaw/releases) → `UAE-Lab-Vision-AI.apk` |
| **UAE Lab Expert** | [`apks/UAE-Lab-Expert.apk`](apks/UAE-Lab-Expert.apk) |

```powershell
adb install -r UAE-Lab-Vision-AI.apk
adb install -r UAE-Lab-Expert.apk
```

Set Lab Expert Mission Control URL to `http://YOUR_PC_IP:8090`.

---

## 3. What you get

### Mission Control (web) — `people-directory/` · port **8090**

1. Lab Inventory  
2. Lab Knowledge  
3. Mobile PS / Lab Test  
4. Evidence Tickets  
5. Expert Engineer (live WebRTC)  
6. Digital Capture (ab-twin)  

### Android apps

| App | Role |
|-----|------|
| **UAE Lab Vision AI** | Glasses / phone AI (Gemini Live + agents) |
| **UAE Lab Expert** | Rings and answers Expert Engineer calls |

### Optional services

| Service | Port |
|---------|------|
| OpenClaw gateway | 18789 |
| Mobile PS API / UI | 8100 / 5173 |

---

## 4. Prerequisites (build from source)

| Tool | Notes |
|------|--------|
| Node.js 22.5+ | Mission Control + Vite |
| Python 3.10+ | Mobile PS FastAPI |
| Android Studio / JDK 17+ | Build APKs from source |
| ADB | Install APKs |
| Gemini API key | https://aistudio.google.com/apikey |
| GitHub Packages token | Meta DAT SDK (`github_token` in `local.properties`) |

---

## 5. Mission Control (PC)

```powershell
cd people-directory
npm install
npm start
```

Open `http://localhost:8090` or `http://YOUR_PC_IP:8090`.

### Mobile PS (optional)

```powershell
cd people-directory\backend
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8100

cd people-directory\frontend
npm install
npm run dev
```

### OpenClaw (optional)

```powershell
openclaw gateway --port 18789
```

---

## 6. Build from source (optional)

### UAE Lab Vision AI

```powershell
cd samples\CameraAccessAndroid
copy ...\Secrets.kt.example ...\Secrets.kt
# Edit peopleDirectoryURL + geminiAPIKey
.\gradlew.bat :app:installDebug
```

### UAE Lab Expert

```powershell
cd samples\LabExpert
.\gradlew.bat :app:installDebug
```

---

## 7. Demo script

1. Start Mission Control on the PC.  
2. UAE Lab Vision AI → Start on Glasses or Phone → **AI ON**.  
3. Try: “Open Lab Inventory”, “Open Lab Knowledge”, “Open Evidence Tickets”, “Open Expert Engineer”.  
4. Answer on Lab Expert (or Mission Control Support).  
5. End call → review ticket in Mission Control.  
6. Optional: “Open Live Music”, “Open BBC Radio”, “Open Live Football”.

---

## 8. Troubleshooting

| Issue | Fix |
|-------|-----|
| Phone can’t open Mission Control | Same Wi‑Fi; allow firewall on 8090; use PC LAN IP |
| Expert rings but no video | Wait for glasses room; check WebRTC signaling |
| Lab Expert never rings | Base URL = `http://PC_IP:8090`; Mission Control running |
| Gemini silent (BT off) | Raise **media** volume; use latest Vision AI APK |

---

*UAE Lab Vision AI · TS A&I · Branch `uae-lab-vision-ai`*
