# LAB VISION Demo Hub

Local web dashboard and REST API backing five AI-glasses demos for telecom lab workflows.

## Run

Requires Node.js 22.5 or later (Node 24 recommended).

```powershell
cd people-directory
npm start
```

Open `http://localhost:8090`. From another device on the same Wi-Fi, use `http://YOUR_PC_IP:8090`.
The SQLite database is created at `data/people.db`.

## AI Glasses Demos

1. **Lab Inventory Agent** — “Where is the RF shield box, and how many 5G test phones are available?”
2. **Lab Knowledge Agent** — “Explain the approved Packet Core Upgrade validation procedure.”
3. **Mobile PS / Lab Test Agent** — “Start five Mobile PS cycles, analyze failures and create the report.”
4. **Evidence Ticket Agent** — “Create a ticket with evidence of this alarm.”  
   Flow: describe what the evidence shows → choose screenshot or short video → capture from glasses → tracked ticket with code like `TKT-20260902-0001`.
5. **Expert Engineer Agent** — live support from AI glasses.
6. **ab-twin / Digital Capture** — walk-through digital capture from lab video.

## API

### Demo metadata
- `GET /api/demos` — list demo agents with example voice prompts
- `GET /api/health`

### Lab Inventory
- `GET /api/inventory?q=`
- `GET /api/inventory/lookup?q=` — returns `spoken_summary` for glasses
- `POST /api/inventory`
- `GET|PUT|DELETE /api/inventory/:id`

### Lab Knowledge
- `GET /api/knowledge?q=`
- `GET /api/knowledge/lookup?q=` — returns matching procedure with `spoken_summary`
- `POST /api/knowledge`
- `GET /api/knowledge/:id`

### Autonomous Lab Tests
- `POST /api/tests/start` — `{ test_type, cycles, name? }`
- `GET /api/tests`
- `GET /api/tests/:id`
- `GET /api/tests/:id/report`

### Evidence Tickets
- `POST /api/tickets` — `{ description, evidence_type: "screenshot"|"video", image? | video_frames?, title?, device? }`
- `GET /api/tickets?q=` — list/search tickets (no media payload)
- `GET /api/tickets/lookup?code=` — lookup by ticket code with `spoken_summary`
- `GET /api/tickets/:id` — ticket detail including screenshot `image` or `video_frames`

### Agent runtime
- `GET /api/logs` — recent API activity
- `GET /api/logs/stream` — SSE live log stream
- `GET /api/agents/status` — connected glasses/mobile/web agents
- `POST /api/agents/connect` — register agent session

### Staff directory (face recognition)
- `GET /api/lookup?name=`
- `POST /api/enroll`
- `GET|POST|PUT|DELETE /api/people` and project routes

The staff directory APIs remain available for VisionClaw face enrollment and recognition tools on the glasses app.
