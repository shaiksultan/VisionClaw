---
name: uaelab-mission-control
description: Understand and route e& UAELAB Lab AI Mission Control specialist agents (inventory, knowledge, Mobile PS, tickets, Expert Engineer, ab-twin).
---

# UAELAB Mission Control agents

You help the lab manager operate **Lab AI Mission Control** (`people-directory` on port **8090**).

You do **not** need model fine-tuning. Use this playbook + live `/api/*` facts from Mission Control chat.

## Roles

| UI id | Agent | Runtime id | Use when |
| --- | --- | --- | --- |
| `chat` | Mission Control (Lab Manager) | mission-control | Lab-wide questions, routing, ticket overview |
| `inventory` | Lab Inventory Agent | lab-inventory-agent | Equipment location, stock, availability |
| `knowledge` | Lab Knowledge Assistant | lab-knowledge-agent | Procedures, Packet Core upgrade docs |
| `mobile-ps` | Mobile PS validation | mobile-ps-agent | Dual-UE ADB attach/web/speed/VoLTE cycles |
| `tickets` | Evidence Ticket Agent | evidence-ticket-agent | Screenshot/video evidence tickets |
| `support` | Expert Engineer Agent | expert-engineer-agent | Live WebRTC support from AI glasses |
| `ab-twin` | ab-twin | ab-twin-agent | Lab walk-through → 3DGS digital twin |

## How Mission Control talks to agents today

1. **Lab Manager chat** (`view=chat`) — OpenClaw answers as Lab Manager with local SQLite context (tickets, inventory, knowledge).
2. **Specialist page chat** (`view=inventory` etc.) — OpenClaw answers **as that agent** with the same DB snapshot.
3. **Open UI** — emit a line `ACTION_VIEW:<id>` (e.g. `ACTION_VIEW:inventory`) so the web console navigates.

## Example prompts

- “Where is the RF shield box?” → inventory facts / `ACTION_VIEW:inventory`
- “Explain Packet Core Upgrade validation” → knowledge / `ACTION_VIEW:knowledge`
- “Start five Mobile PS cycles” → mobile-ps / `ACTION_VIEW:mobile-ps`
- “Create a ticket with screenshot evidence” → tickets / `ACTION_VIEW:tickets`
- “Today’s support requests” / `SUP-…` → support facts from Mission Control DB (never shell search) / `ACTION_VIEW:support`
- “Call the Expert Engineer” → support / `ACTION_VIEW:support`
- “Create digital twin from walk-through” → ab-twin / `ACTION_VIEW:ab-twin`

## APIs (Mission Control :8090)

- `GET /api/demos` — agent catalog
- `POST /api/chat` — OpenClaw + local DB (`message`, optional `view`/`agent`)
- `GET /api/inventory/lookup?q=` · `POST /api/inventory` (requires name, description, location) · `GET /api/knowledge/lookup?q=`
- `GET /api/support/sessions` · `POST /api/tickets` · `POST /api/support/sessions`
- `POST /api/reports/tickets/pptx` `{ "scope": "all|open|today|closed" }` · `GET /api/reports/<file.pptx>`
- Use Mission Control chat LOCAL DATABASE CONTEXT for today’s SUP- calls. Never bash/rg the filesystem.
- Ticket PowerPoint exports are built locally from SQLite (not OpenClaw tools). If scope is unclear, ask: all / open / today / closed.
- `POST /api/agents/connect|heartbeat|disconnect` · `GET /api/agents/status`

## Install into OpenClaw workspace

Copy this folder to the OpenClaw workspace skills dir (highest precedence):

```text
%USERPROFILE%\.openclaw\workspace\skills\uaelab-mission-control\
```

Or point `skills.load.extraDirs` at:

```text
…/VisionClaw/people-directory/openclaw/skills
```

Then restart the OpenClaw gateway. Ask: “Which UAELAB agent handles backhaul tickets?”
