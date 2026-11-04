# Lab Vision AI

![Lab Vision AI](assets/lab-vision-ai-hero.png)

**AI-Powered Lab Operations — Hands-free. Smarter. Faster.**

Connecting engineers, equipment, and knowledge through **AI glasses**, a **mobile app**, and **Mission Control**.

**Innovate · Test · Validate · Enable**

| | |
|---|---|
| **Project** | Lab Vision AI (Mission Control + voice agents) |
| **Organization** | etisalat · UAELAB (Technology Department, Abu Dhabi) |
| **Main development** | [Sultan Sharief Shaik](https://github.com/shaiksultan) (`@shaiksultan`) |
| **Repository** | https://github.com/shaiksultan/VisionClaw |
| **Demo branch** | [`cursor/expert-engineer-audio-mission-control`](https://github.com/shaiksultan/VisionClaw/tree/cursor/expert-engineer-audio-mission-control) |
| **Install guide** | [DEMO_INSTALL_AND_USE.md](DEMO_INSTALL_AND_USE.md) |

This repository builds on [VisionClaw](https://github.com/Intent-Lab/VisionClaw) (Meta Ray-Ban + Gemini Live) and extends it into a **telecom lab operations platform** for UAELAB.

---

## About this project

Lab Vision AI turns Meta Ray-Ban glasses and Android phones into a voice-first lab assistant. Field and lab engineers speak naturally; agents call lab systems, create evidence, and can escalate to a live Expert Engineer with glasses video.

### What it delivers

| Capability | Description |
|------------|-------------|
| **Voice AI Assistant** | Real-time multimodal conversation (speech + vision) |
| **Live camera & video** | Glasses / phone camera into Gemini Live and Expert sessions |
| **Tool calling** | Intent → inventory, knowledge, tests, tickets, lab APIs |
| **Expert collaboration** | Live WebRTC call from glasses to Mission Control / Lab Expert app |

### Voice-activated agents (Mission Control)

Say the agent name (or describe the task) to launch the service:

| Agent | Example prompt | What it does |
|-------|----------------|--------------|
| **Lab Inventory** | “Lab Inventory” / “Where is the RF shield box?” | Find or add equipment; stock & location |
| **Lab Knowledge** | “Lab Knowledge” / “Explain the upgrade procedure” | Approved procedures & runbooks |
| **Mobile PS** | “Start Mobile PS cycles…” | Dual-UE packet-core validation |
| **Evidence Tickets** | “Create a ticket for this alarm” | Photo/video evidence + tracked ticket |
| **Expert Engineer** | “Call the Lab Expert Engineer” | Live video to remote expert |
| **Digital Capture** | “Create digital capture…” | Lab walk-through / digital context |
| **Visual Troubleshoot** | Visual fault assist | Camera-assisted troubleshooting |

### Other voice services (platform flexibility)

| Service | Example | Purpose |
|---------|---------|---------|
| **Live Music** | “Open Live Music” / “Play music” | Voice-driven music playback |
| **BBC Radio** | “Open BBC Radio” | Live World Service radio |
| **Live Football** | “Open Live Football” | Voice sports / song radio demo |

These show that **new services plug into the same voice-first agent interface**.

---

## Technology overview

![Architecture](assets/lab-vision-ai-architecture.png)

```
Ray-Ban Meta glasses  --Bluetooth / camera SDK-->  Lab Vision AI (Android)
        |                                              |
        | Wi-Fi / 5G                                   |
        v                                              v
   Gemini Live API (realtime multimodal)     optional local AI (STT/LLM/Vision/TTS)
        |
        v
   Mission Control (lab systems)
   · Agent orchestration · Tool calling & APIs
   · Live expert sessions · Tickets & evidence · Monitoring & audit
```

### Technology stack & key components

![Stack](assets/lab-vision-ai-stack.png)

| Layer | Role |
|-------|------|
| **Meta Wearables SDK** | Glasses ↔ Android: camera, audio, sensors, control |
| **Gemini Live API** | Realtime voice + vision, function calling, low latency |
| **Local AI (optional)** | Whisper STT · Qwen/DeepSeek LLM · Qwen-VL · Piper TTS |
| **RAG & Knowledge** | Approved procedures, runbooks, device info, cited search |
| **Function calling & lab APIs** | Intent → inventory, tests, network tools, ticketing |
| **WebRTC Expert Support** | Live A/V from glasses → expert; session evidence |
| **Mission Control** | Agent routing, sessions, tickets, monitoring |

---

## Repository layout

```text
VisionClaw/
├── DEMO_INSTALL_AND_USE.md     ← step-by-step install & demo script
├── people-directory/           ← Mission Control web + API (:8090)
│   ├── backend/                ← Mobile PS FastAPI (:8100)
│   └── frontend/               ← Mobile PS UI (:5173)
├── samples/
│   ├── CameraAccessAndroid/    ← Lab Vision AI Android app
│   └── LabExpert/              ← Expert Engineer call-receiver app
└── assets/                     ← README / deck visuals
```

---

## Quick start

**Full instructions (recommended):** [DEMO_INSTALL_AND_USE.md](DEMO_INSTALL_AND_USE.md)

### Clone this fork

```powershell
git clone -b cursor/expert-engineer-audio-mission-control https://github.com/shaiksultan/VisionClaw.git
cd VisionClaw
```

### Mission Control (PC)

```powershell
cd people-directory
npm install
npm start
```

Open `http://localhost:8090` (or `http://YOUR_PC_IP:8090` from phones).

### Lab Vision AI (Android)

```powershell
cd samples\CameraAccessAndroid
# Configure Secrets.kt from Secrets.kt.example (Gemini key + Mission Control URL)
# Add github_token to local.properties for Meta DAT packages
.\gradlew.bat :app:installDebug
```

### Lab Expert (call receiver)

```powershell
cd samples\LabExpert
.\gradlew.bat :app:installDebug
```

Set Mission Control base URL on the device to `http://YOUR_PC_IP:8090`.

---

## Demo flow (short)

1. Start **Mission Control** on the PC.  
2. Open **Lab Vision AI** → Start on Glasses or Phone → **AI ON**.  
3. Try: inventory lookup, knowledge Q&A, evidence ticket, Expert Engineer call.  
4. On a second phone (or Mission Control Support page), answer with **Lab Expert**.  
5. End the call → review the open evidence ticket in Mission Control.

---

## Credits & lineage

### Design concept

Concept and design contributors (etisalat UAE):

| | |
|---|---|
| **Ayman Elnashar**¹ ² | Design concept |
| **Mohamed S. AlZaabi**¹ | Design concept |
| **Mohammad Sameer**¹ | Design concept |
| **Yunus Shaikh**¹ | Design concept |

### Main development

| | |
|---|---|
| **Sultan Sharief Shaik**¹ ([@shaiksultan](https://github.com/shaiksultan)) | **Main development** — Lab Vision AI app, Mission Control, agents, Expert Engineer, and demo platform |

### Affiliations

1. Technology Department, etisalat UAE, Abu Dhabi, UAE  
2. College of Computing and Mathematical Sciences, Khalifa University, Abu Dhabi, UAE  

### Platform lineage

- Built on **VisionClaw** (Meta Ray-Ban + Gemini Live + OpenClaw). Upstream / org mirrors: [Intent-Lab/VisionClaw](https://github.com/Intent-Lab/VisionClaw).  
- Hardware: Meta Ray-Ban smart glasses · Meta Wearables DAT SDK.  
- Cloud AI: [Gemini Live API](https://ai.google.dev/gemini-api/docs/live).

### VisionClaw academic citation (upstream)

If you use the underlying VisionClaw research stack, please cite:

```bibtex
@article{liu2026visionclaw,
  title={VisionClaw: Always-On AI Agents through Smart Glasses},
  author={Liu, Xiaoan and Lee, DaeHo and Gonzalez, Eric J and Gonzalez-Franco, Mar and Suzuki, Ryo},
  journal={arXiv preprint arXiv:2604.03486},
  year={2026}
}
```

---

## License

This source code is licensed under the license found in the [LICENSE](LICENSE) file in the root directory of this source tree.

---

*Reference deck: Lab Vision AI V1.2 (etisalat / UAELAB). Document aligned to Mission Control demo branch.*
