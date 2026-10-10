const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "people.db");
const FASTAPI_URL = process.env.FASTAPI_URL || "";
const WEBRTC_SIGNAL_URL = process.env.WEBRTC_SIGNAL_URL || "wss://visionclaw-signaling.fly.dev";
const WEBRTC_VIEWER_URL = process.env.WEBRTC_VIEWER_URL || "/support-viewer.html";
const twinPipeline = require("./twin/pipeline");
const {
  handleTicketPptxChat,
  buildTicketsPptx,
} = require("./lib/ticket-pptx");
const REPORTS_DIR = path.join(DATA_DIR, "reports");

function loadOpenClawConfig() {
  const base = String(process.env.OPENCLAW_URL || "http://127.0.0.1:18789").replace(/\/$/, "");
  let token = process.env.OPENCLAW_GATEWAY_TOKEN || process.env.OPENCLAW_TOKEN || "";
  if (!token) {
    try {
      const home = process.env.USERPROFILE || process.env.HOME || "";
      const cfgPath = path.join(home, ".openclaw", "openclaw.json");
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      token = cfg?.gateway?.auth?.token || "";
    } catch {
      /* optional */
    }
  }
  return { base, token: String(token || "") };
}

function buildMissionContext(db, query = "") {
  const q = String(query || "").trim();
  const terms = q
    .split(/[^a-zA-Z0-9_-]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 3 && !/^(the|and|for|what|about|these|those|with|from|tell|explain|summarize|recent|please|mean|should|check|first|today|todays)$/i.test(t))
    .slice(0, 4);
  const ticketCount = db.prepare("SELECT COUNT(*) AS c FROM tickets").get()?.c || 0;
  const inventoryCount = db.prepare("SELECT COUNT(*) AS c FROM inventory").get()?.c || 0;
  const knowledgeCount = db.prepare("SELECT COUNT(*) AS c FROM knowledge").get()?.c || 0;
  const supportOpen = db.prepare(`
    SELECT COUNT(*) AS c FROM support_calls
    WHERE status='active' AND call_phase IN ('ringing','waiting','connected','accepted','live')
  `).get()?.c || 0;
  const supportToday = db.prepare(`
    SELECT COUNT(*) AS c FROM support_calls
    WHERE date(started_at)=date('now','localtime')
  `).get()?.c || 0;
  const recentTickets = db.prepare(`
    SELECT id, ticket_code, title, description, status, evidence_type, device, created_at
    FROM tickets ORDER BY id DESC LIMIT 8
  `).all();
  const recentSupport = db.prepare(`
    SELECT c.id, c.call_code, c.description, c.status, c.call_phase, c.device, c.started_at, c.ended_at, t.ticket_code
    FROM support_calls c
    LEFT JOIN tickets t ON t.id = c.ticket_id
    ORDER BY c.id DESC LIMIT 12
  `).all();
  const todaySupport = db.prepare(`
    SELECT c.id, c.call_code, c.description, c.status, c.call_phase, c.device, c.started_at, c.ended_at, t.ticket_code
    FROM support_calls c
    LEFT JOIN tickets t ON t.id = c.ticket_id
    WHERE date(c.started_at)=date('now','localtime')
    ORDER BY c.id DESC LIMIT 20
  `).all();
  let inventoryHits = [];
  let knowledgeHits = [];
  let ticketHits = [];
  let supportHits = [];
  for (const term of terms) {
    const like = `%${term}%`;
    ticketHits = ticketHits.concat(db.prepare(`
      SELECT id, ticket_code, title, description, status, evidence_type, device, created_at
      FROM tickets
      WHERE ticket_code LIKE ? OR title LIKE ? OR description LIKE ? OR status LIKE ?
      ORDER BY id DESC LIMIT 6
    `).all(like, like, like, like));
    inventoryHits = inventoryHits.concat(db.prepare(`
      SELECT name, category, location, quantity, status
      FROM inventory
      WHERE name LIKE ? OR category LIKE ? OR location LIKE ? OR notes LIKE ?
      ORDER BY name COLLATE NOCASE LIMIT 6
    `).all(like, like, like, like));
    knowledgeHits = knowledgeHits.concat(db.prepare(`
      SELECT title, summary, tags FROM knowledge
      WHERE title LIKE ? OR summary LIKE ? OR tags LIKE ? OR content LIKE ?
      ORDER BY title LIMIT 4
    `).all(like, like, like, like));
    supportHits = supportHits.concat(db.prepare(`
      SELECT c.id, c.call_code, c.description, c.status, c.call_phase, c.device, c.started_at, c.ended_at, t.ticket_code
      FROM support_calls c
      LEFT JOIN tickets t ON t.id = c.ticket_id
      WHERE c.call_code LIKE ? OR c.description LIKE ? OR c.status LIKE ? OR t.ticket_code LIKE ?
      ORDER BY c.id DESC LIMIT 8
    `).all(like, like, like, like));
  }
  const dedupeTickets = [...new Map([...recentTickets, ...ticketHits].map(t => [t.id || t.ticket_code, t])).values()].slice(0, 12);
  const dedupeInv = [...new Map(inventoryHits.map(i => [i.name, i])).values()].slice(0, 8);
  const dedupeKnow = [...new Map(knowledgeHits.map(k => [k.title, k])).values()].slice(0, 5);
  const dedupeSupport = [...new Map(
    [...todaySupport, ...recentSupport, ...supportHits].map(s => [s.id || s.call_code, s]),
  ).values()].slice(0, 16);
  const agents = DEMO_AGENTS.map(a => `${a.id}: ${a.name}`).join("; ");
  const mapSupport = rows => rows.map(s => ({
    code: s.call_code,
    description: String(s.description || "").slice(0, 200),
    status: s.status,
    phase: s.call_phase || "",
    device: s.device || "",
    ticket_code: s.ticket_code || null,
    started_at: s.started_at,
    ended_at: s.ended_at || null,
  }));
  return {
    summary: {
      tickets: ticketCount,
      inventory: inventoryCount,
      knowledge: knowledgeCount,
      open_support_calls: supportOpen,
      support_calls_today: supportToday,
      agents,
    },
    agent_playbook: agentPlaybook(),
    recent_tickets: dedupeTickets.map(t => ({
      code: t.ticket_code,
      title: t.title,
      status: t.status,
      evidence: t.evidence_type,
      device: t.device,
      description: String(t.description || "").slice(0, 240),
      created_at: t.created_at,
    })),
    support_calls_today: mapSupport(todaySupport),
    recent_support_calls: mapSupport(dedupeSupport),
    inventory_matches: dedupeInv,
    knowledge_matches: dedupeKnow,
  };
}

/** Compact roster OpenClaw uses to understand / route lab agents (not ML training). */
function agentPlaybook() {
  return DEMO_AGENTS.map(a => ({
    id: a.id,
    name: a.name,
    role: a.routeDesc,
    runtime: a.routeAgent,
    when_to_use: a.description,
    example: a.example,
    open_with: `ACTION_VIEW:${a.id}`,
  }));
}

function labManagerPlaybookText() {
  const lines = [
    "UAELAB agent roster (Mission Control / Lab Manager coordinates these):",
    ...DEMO_AGENTS.map(a =>
      `- ${a.id} | ${a.name} | ${a.routeAgent} — ${a.routeDesc}. Example: "${a.example}" → ACTION_VIEW:${a.id}`
    ),
    "- chat | Mission Control (Lab Manager) — lab-wide coordination, tickets DB, routing.",
    "When the operator should work inside a specialist UI, include ACTION_VIEW:<id> on its own line.",
  ];
  return lines.join("\n");
}

function resolveChatAction(text) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();
  const openMatch = lower.match(/\b(?:open|show|go to|launch|switch to)\s+(?:the\s+)?(.+)$/i);
  const target = (openMatch?.[1] || lower).trim();
  const map = [
    { view: "tickets", keys: ["ticket", "evidence", "tkt"] },
    { view: "inventory", keys: ["inventory", "stock", "equipment"] },
    { view: "knowledge", keys: ["knowledge", "procedure", "docs"] },
    { view: "support", keys: ["support", "expert engineer", "live call", "engineer"] },
    { view: "ab-twin", keys: ["twin", "digital twin", "ab-twin"] },
    { view: "tests", keys: ["test", "run test"] },
    { view: "mobile-ps", keys: ["mobile ps", "packet core"] },
    { view: "dashboard", keys: ["dashboard"] },
    { view: "kanban", keys: ["kanban", "board"] },
    { view: "logs", keys: ["runtime", "logs", "activity"] },
    { view: "agents", keys: ["agents", "all agents"] },
    { view: "overview", keys: ["overview", "ai glasses", "home"] },
    { view: "chat", keys: ["chat", "assistant", "lab manager", "mission control"] },
  ];
  // Only treat as navigation when the phrase is clearly an open/show command,
  // not when "open" appears inside another sentence (e.g. "summarize open tickets").
  const isNav = /^(open|show|go to|launch|switch to)\b/i.test(lower);
  if (isNav) {
    for (const row of map) {
      if (row.keys.some(k => target.includes(k))) {
        const demo = DEMO_AGENTS.find(d => d.id === row.view);
        return {
          action: { view: row.view },
          reply: `Opening ${demo?.name || row.view}.`,
          source: "local",
        };
      }
    }
  }
  return null;
}

/** Pick the best specialist agent for a Lab Manager question, then OpenClaw answers as that agent. */
function inferSpecialistFromMessage(message) {
  const lower = String(message || "").toLowerCase();
  if (!lower.trim()) return null;
  const rules = [
    { id: "inventory", patterns: [/\binventory\b/, /\bstock\b/, /\bequipment\b/, /\bwhere is\b/, /\bhow many\b.*\b(available|phones?|boxes?)\b/, /\brf shield\b/, /\badd (an? )?item\b/] },
    { id: "knowledge", patterns: [/\bknowledge\b/, /\bprocedure\b/, /\brunbook\b/, /\bdocumentation\b/, /\bvalidation (procedure|workflow)\b/, /\bhow (do|to)\b/] },
    { id: "tickets", patterns: [/\bticket\b/, /\bevidence\b/, /\bfile (an? )?incident\b/, /\bcreate.*(ticket|evidence)\b/, /\btkt-/] },
    { id: "support", patterns: [/\bexpert engineer\b/, /\bremote support\b/, /\blive (help|call|support)\b/, /\bcall the expert\b/, /\bsupport (call|request|session)s?\b/, /\bSUP-/i] },
    { id: "ab-twin", patterns: [/\bdigital twin\b/, /\bab-twin\b/, /\bwalk-?through\b/, /\bgaussian\b/, /\bcreate (a )?twin\b/] },
    { id: "mobile-ps", patterns: [/\bmobile ps\b/, /\bpacket core\b/, /\bue-a\b/, /\bue-b\b/, /\battach.*(test|validation)\b/] },
  ];
  for (const rule of rules) {
    if (rule.patterns.some(p => p.test(lower))) {
      return DEMO_AGENTS.find(d => d.id === rule.id) || null;
    }
  }
  return null;
}

function answerFromLocalDb(db, text) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();
  const codeMatch = raw.match(/\b(TKT-[A-Z0-9-]+)\b/i);
  if (codeMatch) {
    const code = codeMatch[1];
    const ticket = db.prepare(`
      SELECT id, ticket_code, title, description, status, evidence_type, device, created_at, ticket_type
      FROM tickets WHERE lower(ticket_code)=lower(?) OR ticket_code LIKE ? ORDER BY id DESC LIMIT 1
    `).get(code, `%${code}%`);
    if (!ticket) {
      return { reply: `No ticket found for ${code} in the local Mission Control database.`, source: "local-db", action: { view: "tickets" } };
    }
    return {
      reply: [
        `Ticket ${ticket.ticket_code}`,
        `Title: ${ticket.title}`,
        `Status: ${ticket.status}`,
        `Type: ${ticket.ticket_type || "evidence"} · Evidence: ${ticket.evidence_type || "—"}`,
        `Device: ${ticket.device || "—"} · Created: ${ticket.created_at || "—"}`,
        "",
        ticket.description || "No description.",
      ].join("\n"),
      source: "local-db",
      action: { view: "tickets" },
      data: { ticket },
    };
  }

  const supportCodeMatch = raw.match(/\b(SUP-[A-Z0-9-]+)\b/i);
  if (supportCodeMatch) {
    const code = supportCodeMatch[1];
    const call = db.prepare(`
      SELECT c.*, t.ticket_code
      FROM support_calls c
      LEFT JOIN tickets t ON t.id = c.ticket_id
      WHERE lower(c.call_code)=lower(?) OR c.call_code LIKE ?
      ORDER BY c.id DESC LIMIT 1
    `).get(code, `%${code}%`);
    if (!call) {
      return {
        reply: `No Expert Engineer support call found for ${code} in the local Mission Control database.`,
        source: "local-db",
        action: { view: "support" },
      };
    }
    return {
      reply: [
        `Support call ${call.call_code}`,
        `Status: ${call.status} · Phase: ${call.call_phase || "—"}`,
        `Device: ${call.device || "—"}`,
        `Started: ${call.started_at || "—"}`,
        call.ended_at ? `Ended: ${call.ended_at}` : "Ended: still open / not ended",
        call.ticket_code ? `Linked ticket: ${call.ticket_code}` : "Linked ticket: none yet",
        "",
        call.description || "No description.",
      ].join("\n"),
      source: "local-db",
      action: { view: "support" },
      data: { supportCall: call },
    };
  }

  if (/\b(how many|count|list|show|recent|status|about)\b/.test(lower) && /\btickets?\b/.test(lower)) {
    const rows = db.prepare(`
      SELECT ticket_code, title, status, evidence_type, created_at
      FROM tickets ORDER BY id DESC LIMIT 10
    `).all();
    const total = db.prepare("SELECT COUNT(*) AS c FROM tickets").get()?.c || 0;
    if (!rows.length) {
      return { reply: "There are no evidence tickets in the local database yet.", source: "local-db", action: { view: "tickets" } };
    }
    const lines = rows.map(r => `• ${r.ticket_code} — ${r.title} [${r.status}] (${r.evidence_type || "n/a"})`);
    return {
      reply: `Local DB has ${total} ticket(s). Latest:\n${lines.join("\n")}`,
      source: "local-db",
      action: { view: "tickets" },
    };
  }

  const asksSupport = /\b(support|expert engineer|remote support|live call)\b/.test(lower)
    || /\b(calls?|requests?|sessions?)\b/.test(lower) && /\b(today|todays|open|recent|incoming|waiting)\b/.test(lower);
  if (asksSupport && /\b(today|todays|list|show|how many|count|recent|open|status|request|call)\b/.test(lower)) {
    const wantToday = /\btoday'?s?\b/.test(lower);
    const wantOpen = /\bopen\b|\bwaiting\b|\bringing\b|\blive\b|\bactive\b/.test(lower);
    let rows;
    if (wantOpen) {
      rows = db.prepare(`
        SELECT c.call_code, c.description, c.status, c.call_phase, c.device, c.started_at, t.ticket_code
        FROM support_calls c
        LEFT JOIN tickets t ON t.id = c.ticket_id
        WHERE c.status='active' AND c.call_phase IN ('ringing','waiting','connected','accepted','live')
        ORDER BY c.id DESC LIMIT 20
      `).all();
    } else if (wantToday) {
      rows = db.prepare(`
        SELECT c.call_code, c.description, c.status, c.call_phase, c.device, c.started_at, c.ended_at, t.ticket_code
        FROM support_calls c
        LEFT JOIN tickets t ON t.id = c.ticket_id
        WHERE date(c.started_at)=date('now','localtime')
        ORDER BY c.id DESC LIMIT 30
      `).all();
    } else {
      rows = db.prepare(`
        SELECT c.call_code, c.description, c.status, c.call_phase, c.device, c.started_at, c.ended_at, t.ticket_code
        FROM support_calls c
        LEFT JOIN tickets t ON t.id = c.ticket_id
        ORDER BY c.id DESC LIMIT 12
      `).all();
    }
    const todayCount = db.prepare(`
      SELECT COUNT(*) AS c FROM support_calls WHERE date(started_at)=date('now','localtime')
    `).get()?.c || 0;
    const openCount = db.prepare(`
      SELECT COUNT(*) AS c FROM support_calls
      WHERE status='active' AND call_phase IN ('ringing','waiting','connected','accepted','live')
    `).get()?.c || 0;
    if (!rows.length) {
      return {
        reply: wantToday
          ? `No Expert Engineer support calls were recorded today (${new Date().toISOString().slice(0, 10)}). Open/active now: ${openCount}.`
          : `No matching support calls in the local database. Today: ${todayCount}. Open/active now: ${openCount}.`,
        source: "local-db",
        action: { view: "support" },
        data: { support: [] },
      };
    }
    const lines = rows.map(r => {
      const phase = r.call_phase || r.status || "—";
      const ticket = r.ticket_code ? ` · ticket ${r.ticket_code}` : "";
      return `• ${r.call_code} — ${phase} · ${r.started_at || "—"}${ticket}\n  ${String(r.description || "").slice(0, 140)}`;
    });
    return {
      reply: [
        wantToday
          ? `Today’s Expert Engineer support requests: ${rows.length} (open/active now: ${openCount}).`
          : wantOpen
            ? `Open/active Expert Engineer calls: ${rows.length} (today total: ${todayCount}).`
            : `Recent Expert Engineer support calls (today: ${todayCount}, open now: ${openCount}):`,
        ...lines,
      ].join("\n"),
      source: "local-db",
      action: { view: "support" },
      data: { support: rows },
    };
  }

  if (/\b(inventory|stock|equipment|where is)\b/.test(lower)) {
    const q = raw.replace(/^(where is|find|lookup|search)\s+/i, "").trim() || raw;
    const like = `%${q}%`;
    const items = db.prepare(`
      SELECT name, category, location, quantity, status FROM inventory
      WHERE name LIKE ? OR category LIKE ? OR location LIKE ? OR notes LIKE ?
      ORDER BY name COLLATE NOCASE LIMIT 8
    `).all(like, like, like, like);
    if (!items.length) {
      return { reply: `No inventory matches for “${q}” in the local database.`, source: "local-db", action: { view: "inventory" } };
    }
    return {
      reply: items.map(i => `• ${i.name} — ${i.quantity} ${i.status} @ ${i.location || "unknown"} (${i.category || "—"})`).join("\n"),
      source: "local-db",
      action: { view: "inventory" },
    };
  }

  return null;
}

async function askOpenClaw(message, context, history = [], agent = null) {
  const { base, token } = loadOpenClawConfig();
  if (!token) {
    const err = new Error("OpenClaw gateway token is not configured");
    err.code = "NO_TOKEN";
    throw err;
  }
  const demo = agent ? DEMO_AGENTS.find(d => d.id === agent) : null;
  const slimContext = {
    summary: context.summary,
    agent_playbook: context.agent_playbook || agentPlaybook(),
    recent_tickets: (context.recent_tickets || []).slice(0, 8),
    support_calls_today: (context.support_calls_today || []).slice(0, 12),
    recent_support_calls: (context.recent_support_calls || []).slice(0, 10),
    inventory_matches: (context.inventory_matches || []).slice(0, 6),
    knowledge_matches: (context.knowledge_matches || []).slice(0, 4),
    focused_ticket: context.focused_ticket || null,
    focused_support_call: context.focused_support_call || null,
    active_agent: context.active_agent || null,
  };
  const groundRules = [
    "Use LOCAL DATABASE CONTEXT as the only source of truth for tickets, inventory, knowledge, and support calls.",
    "Never invent counts. Distinguish: support_calls_today (happened today) vs open_support_calls (active/waiting now).",
    "Do NOT run shell, bash, PowerShell, ripgrep, or filesystem searches. Do NOT call tools to find SUP-/TKT- codes.",
    "If the user asks about today’s Expert Engineer / support requests, answer from support_calls_today / recent_support_calls.",
    "If the user asks for a PowerPoint/PPTX of tickets, say Mission Control builds it from the local DB (reply that a local export will be used). Do not invent download links.",
    "Never tell the operator to leave this chat for reports or ticket counts. Answer here with facts/links; do not send them to Tickets view unless they explicitly ask to open it.",
  ];
  const system = demo
    ? [
      `You are ${demo.name} (${demo.routeAgent}) in Lab AI Mission Control.`,
      demo.description,
      `Typical user prompt: ${demo.example}`,
      "Stay in this agent role. Answer with this agent's specialty and local lab DB facts.",
      "Mission Control (Lab Manager) coordinates agents; you are this specialist agent.",
      ...groundRules,
      "If the user asks to switch agents, say which one and include a line exactly like: ACTION_VIEW:<id>",
      "Valid ACTION_VIEW ids: overview,dashboard,agents,inventory,knowledge,tests,mobile-ps,ab-twin,logs,tickets,support,kanban,chat.",
      labManagerPlaybookText(),
      "Keep answers concise and technical.",
      "",
      "LOCAL DATABASE CONTEXT:",
      JSON.stringify(slimContext),
    ].join("\n")
    : [
      "You are Mission Control (Lab Manager) for Lab AI Mission Control / e& UAELAB.",
      "You coordinate the specialist lab agents below. You understand each agent's purpose, when to use it, and how to open it.",
      ...groundRules,
      "Route the operator: recommend the right agent, answer lab-wide questions yourself, or open a specialist with ACTION_VIEW:<id>.",
      labManagerPlaybookText(),
      "Valid ACTION_VIEW ids: overview,dashboard,agents,inventory,knowledge,tests,mobile-ps,ab-twin,logs,tickets,support,kanban,chat.",
      "Keep answers concise and technical.",
      "",
      "LOCAL DATABASE CONTEXT:",
      JSON.stringify(slimContext),
    ].join("\n");

  const messages = [
    { role: "system", content: system },
    ...history.slice(-8).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 4000),
    })),
    { role: "user", content: String(message).slice(0, 4000) },
  ];

  const sessionKey = demo
    ? `agent:main:${demo.routeAgent || demo.id}`
    : "agent:main:mission-control";

  const attempt = async (timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "x-openclaw-session-key": sessionKey,
          "x-openclaw-message-channel": "web",
        },
        body: JSON.stringify({ model: "openclaw", messages, stream: false }),
        signal: controller.signal,
      });
      const text = await response.text();
      let data = {};
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!response.ok) {
        throw new Error(data.error?.message || data.error || `OpenClaw HTTP ${response.status}`);
      }
      const content = data?.choices?.[0]?.message?.content || data?.raw || "";
      if (!String(content).trim()) throw new Error("OpenClaw returned an empty reply");
      return String(content);
    } catch (err) {
      if (err?.name === "AbortError" || /aborted/i.test(String(err?.message || ""))) {
        const timeoutErr = new Error(`OpenClaw timed out after ${Math.round(timeoutMs / 1000)}s`);
        timeoutErr.code = "TIMEOUT";
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await attempt(45000);
  } catch (err) {
    if (err?.code === "TIMEOUT") {
      // One quick retry — gateway sometimes stalls on a cold session.
      return await attempt(60000);
    }
    throw err;
  }
}

function parseActionView(reply) {
  const match = String(reply || "").match(/ACTION_VIEW:([a-z0-9-]+)/i);
  if (!match) return { reply, action: null };
  const view = match[1].toLowerCase();
  const cleaned = String(reply).replace(/\n?ACTION_VIEW:[a-z0-9-]+/ig, "").trim();
  return { reply: cleaned, action: { view } };
}

async function handleMissionChat(db, body = {}) {
  const message = String(body.message || "").trim();
  if (!message) throw new Error("message is required");
  const history = Array.isArray(body.history) ? body.history : [];
  const focusView = String(body.view || body.agent || "").trim().toLowerCase();
  const focusAgent = DEMO_AGENTS.find(d => d.id === focusView) || null;
  const scoped = Boolean(focusAgent);
  // From Lab Manager: route specialty questions to the matching agent, then OpenClaw.
  const routedAgent = scoped ? null : inferSpecialistFromMessage(message);
  const openClawAgent = focusAgent || routedAgent || null;

  const openAction = resolveChatAction(message);
  if (openAction) return openAction;

  // Reports (PPTX etc.) always use local DB — never wait on OpenClaw / shell.
  const pptxReport = await handleTicketPptxChat(db, message, history, REPORTS_DIR);
  if (pptxReport) {
    if (scoped) return { ...pptxReport, action: pptxReport.action || null, agent: focusAgent.id, agent_name: focusAgent.name };
    return pptxReport;
  }

  const local = answerFromLocalDb(db, message);
  // Pure local factual queries that clearly hit the DB return immediately.
  // Broader questions still go to OpenClaw with DB context.
  const wantsAi = /\b(why|how|explain|analyze|summarize|compare|recommend|what should|help me)\b/i.test(message)
    || (!local && true);
  const preferLocalFacts = Boolean(local?.data?.ticket || local?.data?.supportCall || local?.data?.support);
  if (local && (!wantsAi || preferLocalFacts)) {
    // Stay in current chat (Mission Control or specialist) — never auto-jump views for facts.
    if (scoped) return { ...local, action: null, agent: focusAgent.id, agent_name: focusAgent.name };
    return {
      ...local,
      action: null,
      agent: "chat",
      agent_name: "Mission Control (Lab Manager)",
    };
  }

  const context = buildMissionContext(db, message);
  if (local?.data?.ticket) context.focused_ticket = local.data.ticket;
  if (local?.data?.supportCall) context.focused_support_call = local.data.supportCall;
  if (openClawAgent) {
    context.active_agent = {
      id: openClawAgent.id,
      name: openClawAgent.name,
      route: openClawAgent.routeAgent,
      description: openClawAgent.description,
      example: openClawAgent.example,
      tags: openClawAgent.tags || [],
      routed_from_lab_manager: Boolean(routedAgent && !scoped),
    };
  }

  try {
    const raw = await askOpenClaw(
      openClawAgent
        ? (
          routedAgent && !scoped
            ? `Lab Manager routed this to ${openClawAgent.name} (${openClawAgent.id}). Answer as this specialist.\n\n${message}`
            : `Active agent: ${openClawAgent.name} (${openClawAgent.id}). Answer as this agent.\n\n${message}`
        )
        : message,
      context,
      history,
      openClawAgent?.id || null,
    );
    const parsed = parseActionView(raw);
    return {
      reply: parsed.reply,
      source: "openclaw",
      action: parsed.action
        || (scoped ? null : local?.action)
        || (routedAgent && !scoped ? { view: routedAgent.id } : null),
      agent: openClawAgent?.id || "chat",
      agent_name: openClawAgent?.name || "Mission Control (Lab Manager)",
      context_used: true,
      routed: Boolean(routedAgent && !scoped),
    };
  } catch (err) {
    if (local) {
      return {
        ...local,
        action: scoped ? null : local.action,
        reply: `${local.reply}\n\n(Assistant temporarily unavailable: ${err.message})`,
        source: "local-db+openclaw-fallback",
        agent: openClawAgent?.id || "chat",
        agent_name: openClawAgent?.name || "Mission Control (Lab Manager)",
      };
    }
    const ctx = context.summary;
    return {
      reply: [
        err?.code === "TIMEOUT"
          ? "The assistant is slow right now — showing local lab snapshot instead."
          : `Assistant is temporarily unavailable (${err.message}).`,
        `Local snapshot — tickets: ${ctx.tickets}, inventory: ${ctx.inventory}, knowledge: ${ctx.knowledge}, open support: ${ctx.open_support_calls}.`,
        openClawAgent
          ? `You are chatting with ${openClawAgent.name}. Try an agent-specific question, or say “open chat” for Lab Manager.`
          : "Try: “list tickets”, “open inventory”, or a ticket code like TKT-…",
      ].join("\n"),
      source: "local-fallback",
      agent: openClawAgent?.id || "chat",
      agent_name: openClawAgent?.name || "Mission Control (Lab Manager)",
    };
  }
}

async function probeOpenClaw() {
  const { base, token } = loadOpenClawConfig();
  try {
    const response = await fetch(`${base}/v1/chat/completions`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(4000),
    });
    return {
      ok: response.status >= 200 && response.status < 500,
      status: response.status,
      url: base,
      token_configured: Boolean(token),
    };
  } catch (err) {
    return { ok: false, error: err.message, url: base, token_configured: Boolean(token) };
  }
}

function interpretLiveStatus(httpStatus, payload, text) {
  if (!httpStatus || httpStatus >= 400) return "red";
  if (payload && typeof payload === "object") {
    const raw = payload.status ?? payload.state ?? payload.health ?? payload.ok ?? payload.alive ?? payload.up ?? payload.live;
    if (typeof raw === "boolean") return raw ? "green" : "red";
    if (raw != null) {
      const s = String(raw).toLowerCase();
      if (["ok", "up", "healthy", "online", "green", "success", "true", "running", "active", "ready"].includes(s)) return "green";
      if (["down", "error", "fail", "failed", "red", "offline", "unhealthy", "false", "critical", "dead"].includes(s)) return "red";
    }
  }
  const lower = String(text || "").toLowerCase();
  if (/\b(down|error|fail|offline|unhealthy|critical)\b/.test(lower) && !/\b(ok|healthy|up|online)\b/.test(lower)) return "red";
  return "green";
}

const DEMO_AGENTS = [
  {
    id: "inventory",
    number: "01",
    label: "TRACK",
    name: "Lab Inventory Agent",
    description: "Voice lookup and add for lab equipment — always capture item description and location.",
    example: "Add RF shield box to inventory with a photo — description: large copper box for RF isolation; location: Bench A Rack 3.",
    tags: ["CUSTOM APP", "INVENTORY API"],
    routeCategory: "INVENTORY",
    routeDesc: "Equipment lookup, add item, location & stock",
    routeAgent: "lab-inventory-agent",
  },
  {
    id: "knowledge",
    number: "02",
    label: "KNOW",
    name: "Lab Knowledge Assistant",
    description: "Retrieves approved procedures, validation workflows, and lab documentation.",
    example: "Explain the approved Packet Core Upgrade validation procedure.",
    tags: ["CUSTOM APP", "RAG", "DOCS"],
    routeCategory: "KNOWLEDGE",
    routeDesc: "Procedure lookup and validation guidance",
    routeAgent: "lab-knowledge-agent",
  },
  {
    id: "mobile-ps",
    number: "03",
    label: "ACT",
    name: "Mobile PS Packet Core Upgrade Validation Agent",
    description: "Controls two Android UEs over ADB for attach, web, speed, and VoLTE validation during packet core upgrades. Deterministic Python — no LLM in the test path.",
    example: "Assign UE-A and UE-B, check readiness, then start five Mobile PS validation cycles.",
    tags: ["CUSTOM APP", "ADB", "MOBILE PS"],
    routeCategory: "ACTION",
    routeDesc: "Dual-UE packet core upgrade validation",
    routeAgent: "mobile-ps-agent",
  },
  {
    id: "tickets",
    number: "04",
    label: "FILE",
    name: "Evidence Ticket Agent",
    description: "Creates tracked tickets with screenshot or video evidence for lab incidents and faults.",
    example: "Create a ticket for this alarm. The evidence is the red SCTP timeout banner on the MME console.",
    tags: ["CUSTOM APP", "EVIDENCE", "TRACKING"],
    routeCategory: "EVIDENCE",
    routeDesc: "Ticket creation with screenshot or video proof",
    routeAgent: "evidence-ticket-agent",
  },
  {
    id: "support",
    number: "05",
    label: "LIVE",
    name: "Expert Engineer Agent",
    description: "Starts a live expert engineer video call from AI glasses, rings Mission Control, and saves the session as a tracked remote support ticket.",
    example: "Call the Expert Engineer Agent — I need help on this MME alarm screen.",
    tags: ["CUSTOM APP", "WEBRTC", "EXPERT ENGINEER"],
    routeCategory: "SUPPORT",
    routeDesc: "Live expert engineer video with post-call evidence ticket",
    routeAgent: "expert-engineer-agent",
  },
  {
    id: "ab-twin",
    number: "06",
    label: "TWIN",
    name: "ab-twin — Digital Twin Generator",
    description: "Capture a Meta Ray-Ban Gen 2 walk-through video of the telecom lab and generate a navigable 3D Gaussian Splatting digital twin viewable in the browser.",
    example: "Create digital twin — capture the lab walk-through video and build the twin.",
    tags: ["CUSTOM APP", "GAUSSIAN SPLAT", "3DGS"],
    routeCategory: "TWIN",
    routeDesc: "AI-glasses video → 3D Gaussian Splatting lab twin",
    routeAgent: "ab-twin-agent",
  },
];

function openDatabase(filename = DB_PATH) {
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      photo TEXT NOT NULL DEFAULT '',
      consent INTEGER NOT NULL DEFAULT 0 CHECK (consent IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      description TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_people_name ON people(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_projects_person ON projects(person_id);
  `);
  const columns = db.prepare("PRAGMA table_info(people)").all();
  if (!columns.some(column => column.name === "video")) {
    db.exec("ALTER TABLE people ADD COLUMN video TEXT NOT NULL DEFAULT ''");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'Available',
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      summary TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS test_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      test_type TEXT NOT NULL DEFAULT 'Mobile PS',
      cycles_total INTEGER NOT NULL DEFAULT 5,
      cycles_completed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      report TEXT NOT NULL DEFAULT '',
      failures TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_knowledge_title ON knowledge(title COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS agent_sessions (
      session_id TEXT PRIMARY KEY,
      device TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'connected',
      user_agent TEXT NOT NULL DEFAULT '',
      page TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      agent_name TEXT NOT NULL DEFAULT '',
      connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      level TEXT NOT NULL DEFAULT 'info',
      event_type TEXT NOT NULL DEFAULT 'api',
      device TEXT NOT NULL DEFAULT 'unknown',
      agent TEXT NOT NULL DEFAULT '',
      command TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '',
      query TEXT NOT NULL DEFAULT '',
      request_summary TEXT NOT NULL DEFAULT '',
      response_summary TEXT NOT NULL DEFAULT '',
      status_code INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      session_id TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_activity_logs_id ON activity_logs(id DESC);
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      evidence_type TEXT NOT NULL DEFAULT 'screenshot' CHECK (evidence_type IN ('screenshot', 'video')),
      evidence_data TEXT NOT NULL DEFAULT '',
      frame_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      device TEXT NOT NULL DEFAULT '',
      session_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_code ON tickets(ticket_code COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE TABLE IF NOT EXISTS support_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_code TEXT NOT NULL UNIQUE,
      room_code TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
      ticket_id INTEGER,
      device TEXT NOT NULL DEFAULT '',
      session_id TEXT NOT NULL DEFAULT '',
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      frame_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_support_calls_status ON support_calls(status);
    CREATE INDEX IF NOT EXISTS idx_support_calls_room ON support_calls(room_code COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      support_call_id INTEGER NOT NULL REFERENCES support_calls(id) ON DELETE CASCADE,
      sender TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_support_messages_call ON support_messages(support_call_id);
  `);
  const ticketColumns = db.prepare("PRAGMA table_info(tickets)").all();
  if (!ticketColumns.some(column => column.name === "ticket_type")) {
    db.exec("ALTER TABLE tickets ADD COLUMN ticket_type TEXT NOT NULL DEFAULT 'evidence'");
  }
  if (!ticketColumns.some(column => column.name === "support_call_id")) {
    db.exec("ALTER TABLE tickets ADD COLUMN support_call_id INTEGER");
  }
  const supportColumns = db.prepare("PRAGMA table_info(support_calls)").all();
  if (!supportColumns.some(column => column.name === "call_phase")) {
    db.exec("ALTER TABLE support_calls ADD COLUMN call_phase TEXT NOT NULL DEFAULT 'waiting'");
  }
  if (!supportColumns.some(column => column.name === "expert_label")) {
    db.exec("ALTER TABLE support_calls ADD COLUMN expert_label TEXT NOT NULL DEFAULT ''");
  }
  if (!supportColumns.some(column => column.name === "request_type")) {
    db.exec("ALTER TABLE support_calls ADD COLUMN request_type TEXT NOT NULL DEFAULT 'remote_support'");
  }
  const inventoryColumns = db.prepare("PRAGMA table_info(inventory)").all();
  if (!inventoryColumns.some(column => column.name === "image")) {
    db.exec("ALTER TABLE inventory ADD COLUMN image TEXT NOT NULL DEFAULT ''");
  }
  if (!inventoryColumns.some(column => column.name === "video")) {
    db.exec("ALTER TABLE inventory ADD COLUMN video TEXT NOT NULL DEFAULT ''");
  }
  if (!inventoryColumns.some(column => column.name === "media_type")) {
    db.exec("ALTER TABLE inventory ADD COLUMN media_type TEXT NOT NULL DEFAULT ''");
  }
  const agentColumns = db.prepare("PRAGMA table_info(agent_sessions)").all();
  for (const [name, ddl] of [
    ["page", "TEXT NOT NULL DEFAULT ''"],
    ["location", "TEXT NOT NULL DEFAULT ''"],
    ["agent_name", "TEXT NOT NULL DEFAULT ''"],
  ]) {
    if (!agentColumns.some(column => column.name === name)) {
      db.exec(`ALTER TABLE agent_sessions ADD COLUMN ${name} ${ddl}`);
    }
  }
  seedDemoData(db);
  return db;
}

function seedDemoData(db) {
  if (!db.prepare("SELECT COUNT(*) count FROM inventory").get().count) {
    const insert = db.prepare("INSERT INTO inventory(name,category,location,quantity,status,notes) VALUES(?,?,?,?,?,?)");
    insert.run("RF shield box", "RF equipment", "Cabinet B · Shelf 2", 1, "Available", "Calibrated Q2 2026");
    insert.run("5G test phone", "UE devices", "Drawer 4 · Bin 1", 6, "Available", "Samsung S24 batch");
    insert.run("Packet Core simulator", "Core network", "Rack 3 · U42", 1, "In use", "Reserved for PC upgrade validation");
    insert.run("Optical power meter", "Measurement", "Bench 1", 2, "Available", "");
  }
  if (!db.prepare("SELECT COUNT(*) count FROM knowledge").get().count) {
    db.prepare("INSERT INTO knowledge(title,slug,summary,content,tags) VALUES(?,?,?,?,?)").run(
      "Packet Core Upgrade validation procedure",
      "packet-core-upgrade-validation",
      "Approved lab workflow for validating a Packet Core software upgrade before production rollout.",
      [
        "1. Pre-checks: confirm backup snapshot, rollback image, and maintenance window are approved.",
        "2. Baseline: run Mobile PS smoke suite (5 cycles) on the current build and archive KPIs.",
        "3. Upgrade: apply the target Packet Core build in the isolated lab cluster.",
        "4. Validation: rerun Mobile PS (5 cycles), attach attach/detach traces, and compare KPI deltas.",
        "5. Sign-off: if failure rate stays within ±2% of baseline, attach the report and request CAB approval.",
      ].join("\n"),
      "packet core,upgrade,validation,mobile ps",
    );
  }
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 220_000_000) {
        req.destroy();
        reject(new Error("Request is too large"));
      }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function personWithProjects(db, id) {
  const person = db.prepare("SELECT * FROM people WHERE id = ?").get(id);
  if (!person) return null;
  person.consent = Boolean(person.consent);
  person.projects = db.prepare("SELECT * FROM projects WHERE person_id = ? ORDER BY updated_at DESC, id DESC").all(id);
  return person;
}

function cleanPerson(input) {
  const text = key => String(input[key] || "").trim();
  const name = text("name");
  if (!name) throw new Error("Name is required");
  const photo = text("photo");
  if (photo && !/^data:image\/(jpeg|png|webp);base64,/i.test(photo)) throw new Error("Photo must be a JPEG, PNG, or WebP image");
  const video = text("video");
  if (video && !/^data:video\/(mp4|webm|quicktime);base64,/i.test(video)) throw new Error("Video must be an MP4, WebM, or MOV file");
  return { name, title: text("title"), company: text("company"), email: text("email"), phone: text("phone"), notes: text("notes"), photo, video, consent: input.consent ? 1 : 0 };
}

function cleanProject(input) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Project name is required");
  return { name, status: String(input.status || "Active").trim(), description: String(input.description || "").trim() };
}

function inventoryMediaFields(input) {
  const image = String(input.image || "").trim();
  const video = String(input.video || "").trim();
  let mediaType = String(input.media_type || input.mediaType || "").trim().toLowerCase();
  if (!mediaType) {
    if (video) mediaType = "video";
    else if (image) mediaType = "image";
    else mediaType = "";
  }
  if (mediaType && !["image", "video"].includes(mediaType)) {
    throw new Error("media_type must be image or video");
  }
  if (mediaType === "image" && !image) throw new Error("Image data is required when media_type is image");
  if (mediaType === "video" && !video) throw new Error("Video data is required when media_type is video");
  if (image && !/^data:image\//i.test(image) && !/^https?:\/\//i.test(image)) {
    throw new Error("image must be a data URL or http(s) URL");
  }
  if (video && !/^data:video\//i.test(video) && !/^https?:\/\//i.test(video)) {
    throw new Error("video must be a data URL or http(s) URL");
  }
  return {
    image: mediaType === "image" ? image : (mediaType ? "" : image),
    video: mediaType === "video" ? video : (mediaType ? "" : video),
    media_type: mediaType || (video ? "video" : image ? "image" : ""),
  };
}

function inventoryListItem(row) {
  if (!row) return row;
  const hasImage = Boolean(row.image);
  const hasVideo = Boolean(row.video);
  return {
    ...row,
    // Keep list payloads light: full video only on detail GET; image via preview_image.
    image: "",
    video: "",
    has_image: hasImage,
    has_video: hasVideo,
    media_type: row.media_type || (hasVideo ? "video" : hasImage ? "image" : ""),
    preview_image: hasImage ? row.image : "",
  };
}

function cleanInventory(input) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Item name is required");
  const location = String(input.location || "").trim();
  if (!location) throw new Error("Item location is required (e.g. Bench A · Rack 3)");
  // Description is stored in notes; accept either field from clients.
  const notes = String(input.description || input.notes || "").trim();
  if (!notes) throw new Error("Item description is required (what the item is / what it is for)");
  const quantity = Number(input.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error("Quantity must be a non-negative integer");
  const media = inventoryMediaFields(input);
  return {
    name,
    category: String(input.category || "").trim(),
    location,
    quantity,
    status: String(input.status || "Available").trim(),
    notes,
    ...media,
  };
}

function cleanKnowledge(input) {
  const title = String(input.title || "").trim();
  if (!title) throw new Error("Title is required");
  let slug = String(input.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).trim();
  if (!slug) slug = `article-${Date.now()}`;
  return {
    title,
    slug,
    summary: String(input.summary || "").trim(),
    content: String(input.content || "").trim(),
    tags: String(input.tags || "").trim(),
  };
}

function inventorySummary(items) {
  if (!items.length) return "No matching lab inventory items were found.";
  return items.map(item => {
    const desc = String(item.notes || "").trim();
    const where = item.location || "unknown location";
    return desc
      ? `${item.name}: ${desc}. ${item.quantity} at ${where} (${item.status})`
      : `${item.name}: ${item.quantity} at ${where} (${item.status})`;
  }).join(". ") + ".";
}

function knowledgeSummary(article) {
  return `${article.title}. ${article.summary || article.content.split("\n")[0]}`;
}

function nextTicketCode(db) {
  const count = db.prepare("SELECT COUNT(*) count FROM tickets").get().count + 1;
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `TKT-${stamp}-${String(count).padStart(4, "0")}`;
}

function isPlausibleDataUrl(value, kind) {
  const raw = String(value || "").trim();
  if (kind === "image") {
    if (!/^data:image\/(jpeg|png|webp);base64,/i.test(raw)) return false;
  } else if (kind === "video") {
    if (!/^data:video\/(mp4|webm|quicktime);base64,/i.test(raw)) return false;
  } else {
    return false;
  }
  const b64 = raw.split(",", 2)[1] || "";
  // Reject tiny placeholders like base64("abc") that used to be saved as fake evidence.
  return b64.length >= 64;
}

function cleanTicket(input) {
  const description = String(input.description || "").trim();
  if (!description) throw new Error("Evidence description is required");
  const evidenceType = String(input.evidence_type || input.evidenceType || "screenshot").trim().toLowerCase();
  if (!["screenshot", "video"].includes(evidenceType)) throw new Error("evidence_type must be screenshot or video");
  const screenshot = String(input.screenshot || input.photo || input.image || "").trim();
  const videoFrames = Array.isArray(input.video_frames)
    ? input.video_frames.map(frame => String(frame || "").trim()).filter(frame => isPlausibleDataUrl(frame, "image"))
    : [];
  const evidenceData = String(input.evidence_data || "").trim();
  let payload = evidenceData;
  let frameCount = 0;
  if (evidenceType === "screenshot") {
    const candidate = screenshot || evidenceData;
    if (!isPlausibleDataUrl(candidate, "image")) throw new Error("A valid screenshot is required");
    payload = candidate;
    frameCount = 1;
  } else {
    const videoClip = String(input.video || input.video_clip || "").trim();
    if (isPlausibleDataUrl(videoClip, "video")) {
      payload = videoClip;
      frameCount = 1;
    } else if (isPlausibleDataUrl(evidenceData, "video")) {
      payload = evidenceData;
      frameCount = 1;
    } else if (videoFrames.length) {
      payload = JSON.stringify(videoFrames);
      frameCount = videoFrames.length;
    } else if (evidenceData.startsWith("[")) {
      const parsed = JSON.parse(evidenceData);
      const frames = (Array.isArray(parsed) ? parsed : [])
        .map(frame => String(frame || "").trim())
        .filter(frame => isPlausibleDataUrl(frame, "image"));
      if (!frames.length) throw new Error("Video evidence requires at least one frame");
      frameCount = frames.length;
      payload = JSON.stringify(frames);
    } else if (input.ticket_type === "remote_support" || input.allow_empty_evidence) {
      payload = JSON.stringify([]);
      frameCount = 0;
    } else {
      throw new Error("Video evidence requires a video clip (MP4/WebM) or video_frames");
    }
  }
  return {
    title: String(input.title || `Evidence ticket · ${description.slice(0, 48)}`).trim(),
    description,
    evidence_type: evidenceType,
    evidence_data: payload,
    frame_count: frameCount,
    device: normalizeDevice(input.device),
    session_id: String(input.session_id || "").trim(),
    ticket_type: String(input.ticket_type || "evidence").trim() || "evidence",
    support_call_id: Number(input.support_call_id || 0) || null,
  };
}

function ticketSummary(ticket) {
  const kind = ticket.evidence_type === "video"
    ? (/^data:video\//i.test(ticket.evidence_data || "") ? "video clip" : `${ticket.frame_count || 0}-frame video`)
    : "screenshot";
  return `Ticket ${ticket.ticket_code} created and tracked as ${ticket.status}. Evidence saved: ${kind}. ${ticket.description}`;
}

function ticketListItem(ticket) {
  return {
    id: ticket.id,
    ticket_code: ticket.ticket_code,
    title: ticket.title,
    description: ticket.description,
    evidence_type: ticket.evidence_type,
    frame_count: ticket.frame_count,
    status: ticket.status,
    device: ticket.device,
    session_id: ticket.session_id,
    ticket_type: ticket.ticket_type || "evidence",
    support_call_id: ticket.support_call_id || null,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
  };
}

function buildWebRtcViewerUrl(roomCode) {
  const base = WEBRTC_VIEWER_URL.startsWith("http")
    ? WEBRTC_VIEWER_URL.replace(/\/$/, "")
    : WEBRTC_VIEWER_URL;
  const url = new URL(base, "http://localhost");
  if (roomCode) url.searchParams.set("room", String(roomCode).toUpperCase());
  url.searchParams.set("autojoin", "1");
  url.searchParams.set("signal", WEBRTC_SIGNAL_URL);
  if (WEBRTC_VIEWER_URL.startsWith("http")) return url.toString();
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function nextSupportCallCode(db) {
  const count = db.prepare("SELECT COUNT(*) count FROM support_calls").get().count + 1;
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `SUP-${stamp}-${String(count).padStart(4, "0")}`;
}

function supportCallListItem(row) {
  return {
    id: row.id,
    call_code: row.call_code,
    room_code: row.room_code,
    description: row.description,
    status: row.status,
    call_phase: row.call_phase || "waiting",
    request_type: row.request_type || "remote_support",
    expert_label: row.expert_label || "",
    ticket_id: row.ticket_id,
    ticket_code: row.ticket_code || null,
    device: row.device,
    session_id: row.session_id,
    duration_seconds: row.duration_seconds,
    frame_count: row.frame_count,
    started_at: row.started_at,
    ended_at: row.ended_at,
  };
}

function supportCallSummary(call) {
  return `Expert engineer call ${call.call_code} · ${call.call_phase || call.status}. ${call.description}`;
}

function supportCallRow(db, id) {
  return db.prepare(`
    SELECT c.*, t.ticket_code
    FROM support_calls c
    LEFT JOIN tickets t ON t.id = c.ticket_id
    WHERE c.id=?
  `).get(id);
}

function supportCallMessages(db, callId) {
  return db.prepare(`
    SELECT id,support_call_id,sender,message,created_at
    FROM support_messages
    WHERE support_call_id=?
    ORDER BY id ASC
  `).all(callId);
}

function appendSupportCallMessage(db, callId, sender, message) {
  const cleaned = String(message || "").trim();
  if (!cleaned) throw new Error("Message is required");
  const result = db.prepare(`
    INSERT INTO support_messages(support_call_id,sender,message)
    VALUES(?,?,?)
  `).run(callId, String(sender || "system").slice(0, 40), cleaned);
  return db.prepare("SELECT * FROM support_messages WHERE id=?").get(Number(result.lastInsertRowid));
}

function buildSupportTranscript(db, callId) {
  return supportCallMessages(db, callId).map(row => `[${row.sender}] ${row.message}`).join("\n");
}

function finalizeSupportCallTicket(db, call, body = {}) {
  const transcript = buildSupportTranscript(db, call.id);
  const description = [
    `Remote support call ${call.call_code}`,
    call.description ? `Issue: ${call.description}` : "",
    transcript ? `\nTranscript:\n${transcript}` : "",
  ].filter(Boolean).join("\n");
  const ticketInput = cleanTicket({
    title: body.title || `Remote support · ${call.call_code}`,
    description,
    evidence_type: body.evidence_type || "video",
    image: body.image,
    video: body.video,
    video_frames: body.video_frames,
    device: call.device,
    session_id: call.session_id,
    ticket_type: "remote_support",
    support_call_id: call.id,
    allow_empty_evidence: body.allow_empty_evidence !== false,
  });
  const ticketCode = nextTicketCode(db);
  const result = db.prepare(`
    INSERT INTO tickets(ticket_code,title,description,evidence_type,evidence_data,frame_count,status,device,session_id,ticket_type,support_call_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    ticketCode, ticketInput.title, ticketInput.description, ticketInput.evidence_type, ticketInput.evidence_data,
    ticketInput.frame_count, "open", ticketInput.device || call.device, ticketInput.session_id, ticketInput.ticket_type, call.id,
  );
  const ticketId = Number(result.lastInsertRowid);
  db.prepare(`
    UPDATE support_calls
    SET status='ended', call_phase='ended', ticket_id=?, ended_at=CURRENT_TIMESTAMP,
        duration_seconds=?, frame_count=?
    WHERE id=?
  `).run(ticketId, Number(body.duration_seconds || 0) || 0, ticketInput.frame_count, call.id);
  const saved = db.prepare("SELECT * FROM tickets WHERE id=?").get(ticketId);
  return {
    ticket: { ...ticketListItem(saved), spoken_summary: ticketSummary(saved) },
    ticket_id: ticketId,
    ticket_code: ticketCode,
  };
}

/** End abandoned Expert Engineer sessions so they leave In Progress. Evidence tickets stay open. */
function closeAbandonedSupportCalls(db, { maxAgeMinutes = 20 } = {}) {
  const rows = db.prepare(`
    SELECT * FROM support_calls
    WHERE status='active'
      AND datetime(started_at) <= datetime('now', ?)
    ORDER BY id ASC
  `).all(`-${Math.max(1, Number(maxAgeMinutes) || 20)} minutes`);
  let closed = 0;
  for (const call of rows) {
    try {
      const ticketResult = finalizeSupportCallTicket(db, call, {
        title: `Remote support · ${call.call_code}`,
        description: [
          call.description || "Expert engineer call",
          "",
          "Session closed after the live call ended / timed out.",
          "Evidence ticket left OPEN — close it manually when review is done.",
        ].join("\n"),
        allow_empty_evidence: true,
        evidence_type: "video",
        video_frames: [],
      });
      appendSupportCallMessage(
        db,
        call.id,
        "system",
        `Support call closed. Evidence ticket ${ticketResult.ticket_code} created and left open for manual close.`,
      );
      closed += 1;
    } catch {
      /* skip rows that cannot finalize */
    }
  }
  return closed;
}

function attachTicketMedia(ticket, { full = false } = {}) {
  const summary = ticketListItem(ticket);
  summary.has_evidence = Boolean(ticket.evidence_data);
  if (!ticket.evidence_data) return summary;
  if (ticket.evidence_type === "screenshot") {
    summary.preview_image = ticket.evidence_data;
    if (full) summary.image = ticket.evidence_data;
  } else if (/^data:video\//i.test(ticket.evidence_data)) {
    summary.evidence_format = "clip";
    summary.frame_count = 1;
    summary.has_playable_video = true;
    if (full) summary.video = ticket.evidence_data;
  } else {
    try {
      const parsed = JSON.parse(ticket.evidence_data || "[]");
      const frames = Array.isArray(parsed) ? parsed : parsed.frames || [];
      summary.evidence_format = "frames";
      summary.frame_count = summary.frame_count || frames.length;
      summary.preview_image = frames[0] || "";
      summary.has_playable_video = frames.length > 0;
      if (full) summary.video_frames = frames;
    } catch {
      summary.has_playable_video = false;
      if (full) summary.video_frames = [];
    }
  }
  return summary;
}

function buildTestReport(run, failures) {
  const passCount = run.cycles_total - failures.length;
  return [
    `# ${run.name}`,
    "",
    `Test type: ${run.test_type}`,
    `Cycles: ${run.cycles_completed}/${run.cycles_total}`,
    `Result: ${failures.length ? "FAIL" : "PASS"}`,
    "",
    "## Summary",
    failures.length
      ? `${failures.length} cycle(s) failed. Review traces before sign-off.`
      : "All cycles completed within baseline thresholds.",
    "",
    "## Failures",
    failures.length ? failures.map(f => `- Cycle ${f.cycle}: ${f.reason}`).join("\n") : "None",
  ].join("\n");
}

async function proxyTroubleshoot(body) {
  const image = String(body.image || "").trim();
  if (!image) throw new Error("Image is required");
  if (!/^data:image\/(jpeg|png|webp);base64,/i.test(image)) throw new Error("Image must be a JPEG, PNG, or WebP photo");
  const question = String(body.question || "Analyze this screen and tell me what's wrong.").trim();
  if (FASTAPI_URL) {
    const response = await fetch(`${FASTAPI_URL.replace(/\/$/, "")}/troubleshoot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, question }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "FastAPI troubleshooting service failed");
    return data;
  }
  return {
    analysis: "Demo mode: deterministic screen analysis. Likely issue: alarm banner indicates SCTP association timeout on MME-01; check transport links and restart the affected S1AP stack.",
    question,
    source: "local-demo",
  };
}

function simulateTestRun(db, runId) {
  const run = db.prepare("SELECT * FROM test_runs WHERE id=?").get(runId);
  if (!run) return null;
  const failures = [];
  for (let cycle = 1; cycle <= run.cycles_total; cycle += 1) {
    if (cycle === 3 || cycle === 5) failures.push({ cycle, reason: "Mobile PS attach timeout after 12s" });
  }
  const report = buildTestReport({ ...run, cycles_completed: run.cycles_total }, failures);
  db.prepare("UPDATE test_runs SET cycles_completed=?, status=?, failures=?, report=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(run.cycles_total, failures.length ? "completed_with_failures" : "completed", JSON.stringify(failures), report, runId);
  return db.prepare("SELECT * FROM test_runs WHERE id=?").get(runId);
}

const LOG_SKIP = new Set(["/api/logs", "/api/logs/stream", "/api/health"]);
const AGENT_API_PATHS = new Set([
  "/api/inventory/lookup", "/api/knowledge/lookup", "/api/troubleshoot", "/api/tests/start",
  "/api/agents/connect", "/api/lookup", "/api/enroll", "/api/tickets", "/api/tickets/lookup",
  "/api/support/start", "/api/support/end", "/api/support/sessions",
]);

function normalizeDevice(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "unknown";
  if (raw.includes("ray") || raw.includes("glasses") || raw.includes("meta")) return "ray-ban";
  if (raw.includes("iphone") || raw.includes("ios")) return "iphone";
  if (raw.includes("android") || raw.includes("mobile") || raw.includes("phone")) return "mobile";
  if (raw.includes("web") || raw.includes("browser") || raw.includes("console")) return "web";
  return raw.slice(0, 40);
}

function deviceLabel(device) {
  return ({ "ray-ban": "Ray-Ban Meta", iphone: "iPhone", mobile: "Mobile", web: "Web console", unknown: "Unknown device" }[device] || device);
}

function clientAddress(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  let addr = fwd || req.socket?.remoteAddress || "";
  if (addr.startsWith("::ffff:")) addr = addr.slice(7);
  if (addr === "::1") addr = "127.0.0.1";
  return String(addr).slice(0, 80);
}

function presenceFields(body = {}, req = null) {
  const page = String(body.page || body.view || "").trim().slice(0, 120);
  const agentName = String(body.agent_name || body.agentName || "").trim().slice(0, 120);
  let location = String(body.location || "").trim().slice(0, 160);
  if (!location && req) location = clientAddress(req);
  return { page, location, agent_name: agentName };
}

function parseDevice(req, url) {
  const fromHeader = normalizeDevice(req.headers["x-lab-device"] || req.headers["x-visionclaw-device"] || req.headers["x-device-type"]);
  if (fromHeader !== "unknown") return fromHeader;
  const fromQuery = normalizeDevice(url.searchParams.get("device"));
  if (fromQuery !== "unknown") return fromQuery;
  const ua = String(req.headers["user-agent"] || "").toLowerCase();
  if (ua.includes("okhttp")) return "mobile";
  if (ua.includes("android")) return "mobile";
  if (ua.includes("iphone") || ua.includes("cfnetwork")) return "iphone";
  if (ua.includes("visionclaw") || ua.includes("meta wearable")) return "ray-ban";
  if (ua.includes("mozilla") || ua.includes("chrome") || ua.includes("curl")) return "web";
  return "unknown";
}

function sessionFingerprint(device, userAgent) {
  return createHash("sha256").update(`${device}|${userAgent}`).digest("hex").slice(0, 16);
}

function shouldTrackAgent(pathname) {
  if (AGENT_API_PATHS.has(pathname)) return true;
  if (/^\/api\/tests\/\d+\/report$/.test(pathname)) return true;
  if (/^\/api\/tickets\/\d+$/.test(pathname)) return true;
  if (/^\/api\/support\/\d+$/.test(pathname)) return true;
  if (["/api/inventory", "/api/knowledge", "/api/tests", "/api/tickets", "/api/support"].includes(pathname)) return true;
  return false;
}

function ensureAgentSession(db, req, url, entry) {
  if (!shouldTrackAgent(url.pathname)) return entry.session_id || "";
  if (entry.device === "unknown") entry.device = parseDevice(req, url);
  if (entry.device === "unknown") return entry.session_id || "";
  if (!entry.session_id) {
    const ua = String(req.headers["user-agent"] || "agent").slice(0, 200);
    entry.session_id = `auto-${entry.device}-${sessionFingerprint(entry.device, ua)}`;
  }
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 240);
  const location = clientAddress(req);
  db.prepare(`
    INSERT INTO agent_sessions(session_id, device, label, status, user_agent, page, location, agent_name, connected_at, last_seen_at)
    VALUES(?, ?, ?, 'connected', ?, '', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(session_id) DO UPDATE SET
      device=excluded.device,
      label=excluded.label,
      status='connected',
      user_agent=excluded.user_agent,
      location=CASE WHEN excluded.location != '' THEN excluded.location ELSE agent_sessions.location END,
      last_seen_at=CURRENT_TIMESTAMP
  `).run(entry.session_id, entry.device, deviceLabel(entry.device), userAgent, location, deviceLabel(entry.device));
  return entry.session_id;
}

function inferCommand(pathname, method, params) {
  const map = {
    "/api/inventory/lookup": "lookup_inventory",
    "/api/inventory": "add_inventory_item",
    "/api/knowledge/lookup": "lookup_knowledge",
    "/api/troubleshoot": "troubleshoot_screen",
    "/api/tests/start": "start_lab_test",
    "/api/enroll": "enroll_person",
    "/api/tickets": "create_evidence_ticket",
    "/api/tickets/lookup": "lookup_evidence_ticket",
    "/api/support/start": "start_support_call",
    "/api/support/end": "end_support_call",
    "/api/lookup": "identify_person",
    "/api/agents/connect": "agent_connect",
    "/api/agents/disconnect": "agent_disconnect",
    "/api/agents/heartbeat": "agent_heartbeat",
  };
  if (map[pathname]) return map[pathname];
  if (pathname.startsWith("/api/tests/") && pathname.endsWith("/report")) return "get_test_report";
  if (pathname.startsWith("/api/inventory")) return method === "GET" ? "list_inventory" : "update_inventory";
  if (pathname.startsWith("/api/knowledge")) return method === "GET" ? "list_knowledge" : "update_knowledge";
  return `${method.toLowerCase()} ${pathname}`;
}

function inferAgent(command) {
  if (command.includes("inventory")) return "lab-inventory-agent";
  if (command.includes("knowledge")) return "lab-knowledge-agent";
  if (command.includes("test")) return "lab-test-agent";
  if (command.includes("twin") || command.includes("digital")) return "ab-twin-agent";
  if (command.includes("ticket") || command.includes("evidence")) return "evidence-ticket-agent";
  if (command.includes("support") || command.includes("expert")) return "expert-engineer-agent";
  if (command.includes("enroll") || command.includes("identify")) return "staff-directory-agent";
  if (command.startsWith("agent_")) return "visionclaw-runtime";
  return "lab-platform";
}

function summarizeRequest(url, req, body) {
  const q = url.searchParams.get("q") || url.searchParams.get("name") || url.searchParams.get("title");
  if (q) return `query="${q}"`;
  if (body?.question) return `question="${String(body.question).slice(0, 120)}"`;
  if (body?.test_type) return `${body.test_type} · ${body.cycles ?? "?"} cycles`;
  if (body?.description) return `description="${String(body.description).slice(0, 120)}" · ${body.evidence_type || "screenshot"}`;
  if (body?.device) return `device=${normalizeDevice(body.device)}`;
  if (body?.name && body?.company) return `name="${body.name}" company="${body.company}"`;
  return "";
}

function summarizeResponse(body, status) {
  if (!body || typeof body !== "object") return status >= 400 ? "Request failed" : "OK";
  if (body.error) return String(body.error).slice(0, 240);
  if (body.spoken_summary) return String(body.spoken_summary).slice(0, 240);
  if (body.analysis) return String(body.analysis).slice(0, 240);
  if (body.report) return String(body.report).split("\n").slice(0, 3).join(" ").slice(0, 240);
  if (body.ticket_code) return ticketSummary(body);
  if (body.status && body.id && body.cycles_total) return `run #${body.id} · ${body.status}`;
  if (body.ok) return "OK";
  if (Array.isArray(body.items)) return `${body.items.length} item(s) found`;
  return status >= 400 ? "Request failed" : "OK";
}

function logLevel(status, body) {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  if (body?.error) return "warn";
  if (body?.status?.includes?.("fail")) return "warn";
  return "success";
}

function insertLog(db, entry) {
  const result = db.prepare(`
    INSERT INTO activity_logs(level,event_type,device,agent,command,method,path,query,request_summary,response_summary,status_code,duration_ms,session_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    entry.level, entry.event_type, entry.device, entry.agent, entry.command, entry.method, entry.path,
    entry.query, entry.request_summary, entry.response_summary, entry.status_code, entry.duration_ms, entry.session_id || "",
  );
  return db.prepare("SELECT * FROM activity_logs WHERE id=?").get(Number(result.lastInsertRowid));
}

function touchSession(db, sessionId, fields = {}) {
  if (!sessionId) return;
  const page = fields.page != null ? String(fields.page).slice(0, 120) : null;
  const location = fields.location != null ? String(fields.location).slice(0, 160) : null;
  const agentName = fields.agent_name != null ? String(fields.agent_name).slice(0, 120) : null;
  const label = fields.label != null ? String(fields.label).slice(0, 120) : null;
  db.prepare(`
    UPDATE agent_sessions SET
      last_seen_at=CURRENT_TIMESTAMP,
      status='connected',
      page=COALESCE(?, page),
      location=COALESCE(?, location),
      agent_name=COALESCE(?, agent_name),
      label=COALESCE(?, label)
    WHERE session_id=?
  `).run(page, location, agentName, label, sessionId);
}

function activeAgents(db) {
  return db.prepare(`
    SELECT session_id, device, label, status, user_agent, page, location, agent_name, connected_at, last_seen_at
    FROM agent_sessions
    WHERE status='connected'
      AND datetime(last_seen_at) >= datetime('now', '-90 seconds')
    ORDER BY last_seen_at DESC
  `).all();
}

function buildTaskBoard(db) {
  const pending = [];
  const inProgress = [];
  const complete = [];

  const supportRows = db.prepare(`
    SELECT c.id,c.call_code,c.room_code,c.description,c.status,c.call_phase,c.device,c.expert_label,c.started_at,c.ended_at,t.ticket_code
    FROM support_calls c
    LEFT JOIN tickets t ON t.id = c.ticket_id
    ORDER BY c.id DESC LIMIT 40
  `).all();
  for (const row of supportRows) {
    const phase = row.call_phase || (row.status === "ended" ? "ended" : "waiting");
    const item = {
      id: `support-${row.id}`,
      kind: "support",
      title: row.call_code || `Support #${row.id}`,
      summary: row.description || "Remote support request",
      agent: "expert-engineer-agent",
      device: row.device || "unknown",
      executor: row.expert_label || deviceLabel(row.device || "unknown"),
      meta: row.room_code ? `Room ${row.room_code}` : (row.ticket_code || phase),
      ref_id: row.id,
      view: "support",
      updated_at: row.ended_at || row.started_at,
    };
    // Live Expert Engineer call = In Progress. Ended call = Complete.
    // Evidence tickets are separate and stay Pending until closed manually.
    if (phase === "ended" || row.status === "ended") complete.push(item);
    else if (phase === "live" || phase === "connected" || phase === "accepted") inProgress.push(item);
    else pending.push(item); // waiting / ringing
  }

  const testRows = db.prepare(`
    SELECT id,name,test_type,status,cycles_total,cycles_completed,created_at,updated_at
    FROM test_runs ORDER BY id DESC LIMIT 30
  `).all();
  for (const row of testRows) {
    const item = {
      id: `test-${row.id}`,
      kind: "test",
      title: row.name || `Test #${row.id}`,
      summary: `${row.test_type} · ${row.cycles_completed}/${row.cycles_total} cycles`,
      agent: "lab-test-agent",
      device: "web",
      executor: "lab-test-agent",
      meta: String(row.status || "").replaceAll("_", " "),
      ref_id: row.id,
      view: "tests",
      updated_at: row.updated_at || row.created_at,
    };
    if (row.status === "running") inProgress.push(item);
    else if (row.status === "pending") pending.push(item);
    else complete.push(item);
  }

  const ticketRows = db.prepare(`
    SELECT id,ticket_code,title,description,status,ticket_type,device,created_at,updated_at
    FROM tickets ORDER BY id DESC LIMIT 30
  `).all();
  for (const row of ticketRows) {
    const item = {
      id: `ticket-${row.id}`,
      kind: "ticket",
      title: row.ticket_code || `Ticket #${row.id}`,
      summary: row.title || row.description || "Evidence ticket",
      agent: row.ticket_type === "remote_support" ? "expert-engineer-agent" : "evidence-ticket-agent",
      device: row.device || "unknown",
      executor: deviceLabel(row.device || "unknown"),
      meta: row.ticket_type || "evidence",
      ref_id: row.id,
      view: "tickets",
      updated_at: row.updated_at || row.created_at,
    };
    if (row.status === "open") pending.push(item);
    else complete.push(item);
  }

  try {
    for (const twin of twinPipeline.listTwins().slice(0, 20)) {
      const item = {
        id: `twin-${twin.twin_id}`,
        kind: "twin",
        title: twin.twin_id,
        summary: twin.title || twin.current_step || "Digital twin job",
        agent: "ab-twin-agent",
        device: twin.device || "ray-ban",
        executor: twin.engine || "ab-twin",
        meta: twin.status || "",
        ref_id: twin.twin_id,
        view: "ab-twin",
        updated_at: twin.updated_at,
      };
      const st = String(twin.status || "").toUpperCase();
      if (st === "READY") complete.push(item);
      else if (st === "FAILED") complete.push(item);
      else if (st === "QUEUED" || st === "EXTRACTING" || st === "EXTRACTED") pending.push(item);
      else inProgress.push(item);
    }
  } catch { /* twin root may be empty */ }

  const columns = [
    { id: "pending", label: "Pending", color: "blue", items: pending },
    { id: "in_progress", label: "In Progress", color: "amber", items: inProgress },
    { id: "complete", label: "Complete", color: "green", items: complete },
  ].map(col => ({ ...col, count: col.items.length }));

  return {
    queue_total: pending.length + inProgress.length,
    columns,
    agents: activeAgents(db).map(a => ({
      session_id: a.session_id,
      device: a.device,
      label: a.label,
      status: a.status,
      page: a.page || "",
      location: a.location || "",
      agent_name: a.agent_name || a.label || "",
      connected_at: a.connected_at,
      last_seen_at: a.last_seen_at,
    })),
  };
}

function broadcastLog(clients, row) {
  const payload = `data: ${JSON.stringify(row)}\n\n`;
  for (const client of clients) {
    try { client.write(payload); } catch { clients.delete(client); }
  }
}

function shouldLogRequest(pathname) {
  return pathname.startsWith("/api/") && !LOG_SKIP.has(pathname);
}

function buildLogEntry(db, req, url, startedAt, responseMeta, bodyForRequest = null) {
  const { status, body } = responseMeta;
  const command = req.headers["x-lab-command"] || req.headers["x-visionclaw-command"] || inferCommand(url.pathname, req.method, url.searchParams);
  const sessionId = String(req.headers["x-lab-session"] || req.headers["x-visionclaw-session"] || "").trim();
  let device = parseDevice(req, url);
  if (device === "unknown" && sessionId) {
    const session = dbLookupSession(db, sessionId);
    if (session) device = session.device;
  }
  const requestSummary = summarizeRequest(url, req, bodyForRequest);
  const responseSummary = summarizeResponse(body, status);
  const eventType = status >= 400 || body?.error ? "failure" : command.startsWith("agent_") ? "connection" : "command";
  return {
    level: logLevel(status, body),
    event_type: eventType,
    device,
    agent: inferAgent(command),
    command,
    method: req.method,
    path: url.pathname,
    query: url.search || "",
    request_summary: requestSummary,
    response_summary: responseSummary,
    status_code: status,
    duration_ms: Date.now() - startedAt,
    session_id: sessionId,
  };
}

function dbLookupSession(db, sessionId) {
  return db.prepare("SELECT * FROM agent_sessions WHERE session_id=?").get(sessionId);
}

function createHandler(db, publicDir = PUBLIC_DIR) {
  const sseClients = new Set();

  return async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const startedAt = Date.now();
    let responseMeta = null;
    let skipLog = false;
    let requestBody = null;

    const respond = (res, status, body) => {
      responseMeta = { status, body };
      json(res, status, body);
    };

    const finish = () => {
      if (skipLog || !responseMeta || !shouldLogRequest(url.pathname)) return;
      const entry = buildLogEntry(db, req, url, startedAt, responseMeta, requestBody);
      ensureAgentSession(db, req, url, entry);
      const row = insertLog(db, entry);
      broadcastLog(sseClients, row);
    };

    if (req.method === "OPTIONS") {
      skipLog = true;
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type,X-Lab-Device,X-Lab-Command,X-Lab-Session,X-VisionClaw-Device,X-VisionClaw-Command,X-VisionClaw-Session", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS" });
      return res.end();
    }

    try {
      if (url.pathname === "/api/logs/stream" && req.method === "GET") {
        skipLog = true;
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });
        res.write("\n");
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return;
      }

      if (url.pathname === "/api/logs" && req.method === "GET") {
        skipLog = true;
        const since = Number(url.searchParams.get("since") || 0);
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 150), 1), 500);
        const rows = db.prepare("SELECT * FROM activity_logs WHERE id > ? ORDER BY id DESC LIMIT ?").all(since, limit);
        return respond(res, 200, rows.reverse());
      }

      if (url.pathname === "/api/logs" && req.method === "DELETE") {
        skipLog = true;
        db.exec("DELETE FROM activity_logs");
        return respond(res, 200, { ok: true });
      }

      if (url.pathname === "/api/agents/status" && req.method === "GET") {
        skipLog = true;
        return respond(res, 200, { agents: activeAgents(db), log_count: db.prepare("SELECT COUNT(*) count FROM activity_logs").get().count });
      }

      if (url.pathname === "/api/agents/connect" && req.method === "POST") {
        requestBody = await readBody(req);
        const device = normalizeDevice(requestBody.device);
        const sessionId = String(requestBody.session_id || randomUUID());
        const label = String(requestBody.label || deviceLabel(device)).trim().slice(0, 120);
        const userAgent = String(req.headers["user-agent"] || "").slice(0, 240);
        const meta = presenceFields(requestBody, req);
        const agentName = meta.agent_name || label || deviceLabel(device);
        db.prepare(`
          INSERT INTO agent_sessions(session_id, device, label, status, user_agent, page, location, agent_name, connected_at, last_seen_at)
          VALUES(?, ?, ?, 'connected', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(session_id) DO UPDATE SET
            device=excluded.device,
            label=excluded.label,
            status='connected',
            user_agent=excluded.user_agent,
            page=excluded.page,
            location=CASE WHEN excluded.location != '' THEN excluded.location ELSE agent_sessions.location END,
            agent_name=excluded.agent_name,
            last_seen_at=CURRENT_TIMESTAMP
        `).run(sessionId, device, label, userAgent, meta.page, meta.location, agentName);
        return respond(res, 200, {
          session_id: sessionId, device, label, status: "connected",
          page: meta.page, location: meta.location, agent_name: agentName,
        });
      }

      if (url.pathname === "/api/agents/heartbeat" && req.method === "POST") {
        requestBody = await readBody(req);
        const sessionId = String(requestBody.session_id || "").trim();
        if (!sessionId) return respond(res, 400, { error: "session_id is required" });
        const meta = presenceFields(requestBody, req);
        const label = requestBody.label != null ? String(requestBody.label).trim().slice(0, 120) : null;
        touchSession(db, sessionId, {
          page: meta.page || null,
          location: meta.location || null,
          agent_name: meta.agent_name || null,
          label,
        });
        const session = dbLookupSession(db, sessionId);
        if (!session) return respond(res, 404, { error: "Session not found" });
        return respond(res, 200, {
          ok: true,
          session_id: sessionId,
          last_seen_at: session.last_seen_at,
          page: session.page,
          location: session.location,
          agent_name: session.agent_name,
        });
      }

      if (url.pathname === "/api/agents/disconnect" && req.method === "POST") {
        requestBody = await readBody(req);
        const sessionId = String(requestBody.session_id || "").trim();
        if (sessionId) {
          db.prepare("UPDATE agent_sessions SET status='disconnected', last_seen_at=CURRENT_TIMESTAMP WHERE session_id=?")
            .run(sessionId);
        }
        return respond(res, 200, { ok: true });
      }

      if (url.pathname === "/api/health") return respond(res, 200, { ok: true, demos: DEMO_AGENTS.length });
      if (url.pathname === "/api/config" && req.method === "GET") {
        skipLog = true;
        const oc = loadOpenClawConfig();
        return respond(res, 200, {
          webrtc_viewer_url: WEBRTC_VIEWER_URL,
          webrtc_signal_url: WEBRTC_SIGNAL_URL,
          openclaw_url: oc.base,
          openclaw_token_configured: Boolean(oc.token),
        });
      }
      if (url.pathname === "/api/chat/status" && req.method === "GET") {
        skipLog = true;
        return respond(res, 200, await probeOpenClaw());
      }
      if (url.pathname === "/api/chat" && req.method === "POST") {
        const body = await readBody(req);
        const result = await handleMissionChat(db, body);
        return respond(res, 200, result);
      }
      if (url.pathname === "/api/reports/tickets/pptx" && req.method === "POST") {
        requestBody = await readBody(req).catch(() => ({}));
        const scope = String(requestBody?.scope || url.searchParams.get("scope") || "all").toLowerCase();
        const allowed = ["all", "open", "closed", "today"];
        if (!allowed.includes(scope)) return respond(res, 400, { error: "scope must be all|open|closed|today" });
        const result = await buildTicketsPptx(db, { scope, reportsDir: REPORTS_DIR });
        return respond(res, 201, {
          ...result,
          spoken_summary: `Created ${result.fileName} with ${result.exported} tickets (${scope}).`,
        });
      }
      const reportMatch = url.pathname.match(/^\/api\/reports\/([^/]+)$/);
      if (reportMatch && req.method === "GET") {
        skipLog = true;
        const fileName = decodeURIComponent(reportMatch[1]);
        if (!/^[\w.-]+\.pptx$/i.test(fileName)) return respond(res, 400, { error: "Invalid report name" });
        const filePath = path.resolve(REPORTS_DIR, fileName);
        if (!filePath.startsWith(path.resolve(REPORTS_DIR)) || !fs.existsSync(filePath)) {
          return respond(res, 404, { error: "Report not found" });
        }
        res.writeHead(200, {
          "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Access-Control-Allow-Origin": "*",
        });
        return fs.createReadStream(filePath).pipe(res);
      }
      if (url.pathname === "/api/demos" && req.method === "GET") return respond(res, 200, DEMO_AGENTS);
      if (url.pathname === "/api/tasks/board" && req.method === "GET") {
        skipLog = true;
        return respond(res, 200, buildTaskBoard(db));
      }

      if (url.pathname === "/api/inventory/lookup" && req.method === "GET") {
        const q = String(url.searchParams.get("q") || url.searchParams.get("name") || "").trim();
        if (!q) return respond(res, 400, { error: "Query is required" });
        const like = `%${q}%`;
        const items = db.prepare("SELECT * FROM inventory WHERE name LIKE ? OR category LIKE ? OR location LIKE ? OR notes LIKE ? ORDER BY name COLLATE NOCASE LIMIT 8")
          .all(like, like, like, like)
          .map(inventoryListItem);
        return respond(res, 200, { items, spoken_summary: inventorySummary(items) });
      }
      if (url.pathname === "/api/inventory" && req.method === "GET") {
        const q = `%${url.searchParams.get("q") || ""}%`;
        const rows = db.prepare("SELECT * FROM inventory WHERE name LIKE ? OR category LIKE ? OR location LIKE ? OR notes LIKE ? ORDER BY name COLLATE NOCASE")
          .all(q, q, q, q)
          .map(inventoryListItem);
        return respond(res, 200, rows);
      }
      if (url.pathname === "/api/inventory" && req.method === "POST") {
        const item = cleanInventory(await readBody(req));
        const result = db.prepare("INSERT INTO inventory(name,category,location,quantity,status,notes,image,video,media_type) VALUES(?,?,?,?,?,?,?,?,?)")
          .run(item.name, item.category, item.location, item.quantity, item.status, item.notes, item.image, item.video, item.media_type);
        const saved = db.prepare("SELECT * FROM inventory WHERE id=?").get(Number(result.lastInsertRowid));
        const mediaNote = saved.media_type === "video"
          ? " Video attached."
          : saved.media_type === "image"
            ? " Photo attached."
            : "";
        return respond(res, 201, {
          ...saved,
          spoken_summary: `Added ${saved.name} to inventory. Description: ${saved.notes}. Location: ${saved.location}. Quantity ${saved.quantity}, status ${saved.status}.${mediaNote}`,
        });
      }
      const inventoryMatch = url.pathname.match(/^\/api\/inventory\/(\d+)$/);
      if (inventoryMatch) {
        const id = Number(inventoryMatch[1]);
        if (req.method === "GET") {
          const item = db.prepare("SELECT * FROM inventory WHERE id=?").get(id);
          return item ? respond(res, 200, item) : respond(res, 404, { error: "Inventory item not found" });
        }
        if (req.method === "PUT") {
          const existing = db.prepare("SELECT * FROM inventory WHERE id=?").get(id);
          if (!existing) return respond(res, 404, { error: "Inventory item not found" });
          const body = await readBody(req);
          // Keep previous media unless the client sends a replacement or clear_media.
          if (body.clear_media) {
            body.image = "";
            body.video = "";
            body.media_type = "";
          } else {
            if (body.image === undefined) body.image = existing.image || "";
            if (body.video === undefined) body.video = existing.video || "";
            if (body.media_type === undefined && body.mediaType === undefined) {
              body.media_type = existing.media_type || "";
            }
          }
          const item = cleanInventory(body);
          db.prepare("UPDATE inventory SET name=?,category=?,location=?,quantity=?,status=?,notes=?,image=?,video=?,media_type=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .run(item.name, item.category, item.location, item.quantity, item.status, item.notes, item.image, item.video, item.media_type, id);
          return respond(res, 200, db.prepare("SELECT * FROM inventory WHERE id=?").get(id));
        }
        if (req.method === "DELETE") {
          const result = db.prepare("DELETE FROM inventory WHERE id=?").run(id);
          return result.changes ? respond(res, 200, { ok: true }) : respond(res, 404, { error: "Inventory item not found" });
        }
      }

      if (url.pathname === "/api/knowledge/lookup" && req.method === "GET") {
        const q = String(url.searchParams.get("q") || url.searchParams.get("title") || "").trim();
        if (!q) return respond(res, 400, { error: "Query is required" });
        const like = `%${q}%`;
        const article = db.prepare("SELECT * FROM knowledge WHERE title LIKE ? OR slug LIKE ? OR tags LIKE ? OR content LIKE ? ORDER BY CASE WHEN title LIKE ? THEN 0 ELSE 1 END, title LIMIT 1")
          .get(like, like, like, like, like);
        if (!article) return respond(res, 404, { error: "No matching knowledge article found" });
        article.spoken_summary = knowledgeSummary(article);
        return respond(res, 200, article);
      }
      if (url.pathname === "/api/knowledge" && req.method === "GET") {
        const q = `%${url.searchParams.get("q") || ""}%`;
        return respond(res, 200, db.prepare("SELECT id,title,slug,summary,tags,updated_at FROM knowledge WHERE title LIKE ? OR summary LIKE ? OR tags LIKE ? ORDER BY title COLLATE NOCASE").all(q, q, q));
      }
      if (url.pathname === "/api/knowledge" && req.method === "POST") {
        const article = cleanKnowledge(await readBody(req));
        let slug = article.slug;
        const exists = db.prepare("SELECT id FROM knowledge WHERE slug=?").get(slug);
        if (exists) slug = `${slug}-${Date.now().toString(36)}`;
        const result = db.prepare("INSERT INTO knowledge(title,slug,summary,content,tags) VALUES(?,?,?,?,?)")
          .run(article.title, slug, article.summary, article.content, article.tags);
        return respond(res, 201, db.prepare("SELECT * FROM knowledge WHERE id=?").get(Number(result.lastInsertRowid)));
      }
      const knowledgeMatch = url.pathname.match(/^\/api\/knowledge\/(\d+)$/);
      if (knowledgeMatch && req.method === "GET") {
        const article = db.prepare("SELECT * FROM knowledge WHERE id=?").get(Number(knowledgeMatch[1]));
        return article ? respond(res, 200, article) : respond(res, 404, { error: "Knowledge article not found" });
      }

      if (url.pathname === "/api/troubleshoot" && req.method === "POST") {
        requestBody = await readBody(req);
        return respond(res, 200, await proxyTroubleshoot(requestBody));
      }

      if (url.pathname === "/api/tests/start" && req.method === "POST") {
        requestBody = await readBody(req);
        const body = requestBody;
        const cycles = Number(body.cycles ?? 5);
        if (!Number.isInteger(cycles) || cycles < 1 || cycles > 20) return respond(res, 400, { error: "Cycles must be between 1 and 20" });
        const testType = String(body.test_type || "Mobile PS").trim();
        const name = String(body.name || `${testType} run · ${cycles} cycles`).trim();
        const result = db.prepare("INSERT INTO test_runs(name,test_type,cycles_total,status) VALUES(?,?,?,?)")
          .run(name, testType, cycles, "running");
        const run = simulateTestRun(db, Number(result.lastInsertRowid));
        run.failures = JSON.parse(run.failures || "[]");
        return respond(res, 201, run);
      }
      if (url.pathname === "/api/tests" && req.method === "GET") {
        const rows = db.prepare("SELECT id,name,test_type,cycles_total,cycles_completed,status,created_at,updated_at FROM test_runs ORDER BY id DESC LIMIT 20").all();
        return respond(res, 200, rows);
      }
      const testMatch = url.pathname.match(/^\/api\/tests\/(\d+)(\/report)?$/);
      if (testMatch && req.method === "GET") {
        const run = db.prepare("SELECT * FROM test_runs WHERE id=?").get(Number(testMatch[1]));
        if (!run) return respond(res, 404, { error: "Test run not found" });
        run.failures = JSON.parse(run.failures || "[]");
        if (testMatch[2]) {
          run.spoken_summary = run.report.split("\n").slice(0, 6).join(" ");
          return respond(res, 200, run);
        }
        return respond(res, 200, run);
      }

      if (url.pathname === "/api/tickets/lookup" && req.method === "GET") {
        const code = String(url.searchParams.get("code") || url.searchParams.get("ticket_code") || "").trim();
        if (!code) return respond(res, 400, { error: "Ticket code is required" });
        const ticket = db.prepare("SELECT * FROM tickets WHERE lower(ticket_code)=lower(?) OR ticket_code LIKE ? ORDER BY id DESC LIMIT 1").get(code, `%${code}%`);
        if (!ticket) return respond(res, 404, { error: "Ticket not found" });
        const summary = attachTicketMedia(ticket);
        summary.spoken_summary = ticketSummary(ticket);
        return respond(res, 200, summary);
      }
      if (url.pathname === "/api/tickets" && req.method === "GET") {
        const q = `%${url.searchParams.get("q") || ""}%`;
        const includeMedia = url.searchParams.get("include_media") === "1";
        const rows = db.prepare(`
          SELECT id,ticket_code,title,description,evidence_type,evidence_data,frame_count,status,device,session_id,created_at,updated_at
          FROM tickets
          WHERE ticket_code LIKE ? OR title LIKE ? OR description LIKE ?
          ORDER BY id DESC LIMIT 50
        `).all(q, q, q);
        return respond(res, 200, rows.map(row => attachTicketMedia(row, { full: includeMedia })));
      }
      if (url.pathname === "/api/tickets" && req.method === "POST") {
        requestBody = await readBody(req);
        const body = requestBody;
        const ticket = cleanTicket({
          ...body,
          device: body.device || parseDevice(req, url),
          session_id: body.session_id || req.headers["x-lab-session"] || "",
        });
        const ticketCode = nextTicketCode(db);
        const result = db.prepare(`
          INSERT INTO tickets(ticket_code,title,description,evidence_type,evidence_data,frame_count,status,device,session_id,ticket_type,support_call_id)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          ticketCode, ticket.title, ticket.description, ticket.evidence_type, ticket.evidence_data,
          ticket.frame_count, "open", ticket.device || parseDevice(req, url), ticket.session_id,
          ticket.ticket_type || "evidence", ticket.support_call_id,
        );
        const saved = db.prepare("SELECT * FROM tickets WHERE id=?").get(Number(result.lastInsertRowid));
        return respond(res, 201, { ...ticketListItem(saved), spoken_summary: ticketSummary(saved) });
      }
      const ticketMatch = url.pathname.match(/^\/api\/tickets\/(\d+)$/);
      if (ticketMatch && req.method === "GET") {
        const ticket = db.prepare("SELECT * FROM tickets WHERE id=?").get(Number(ticketMatch[1]));
        if (!ticket) return respond(res, 404, { error: "Ticket not found" });
        const summary = attachTicketMedia(ticket, { full: true });
        summary.spoken_summary = ticketSummary(ticket);
        return respond(res, 200, summary);
      }
      if (ticketMatch && req.method === "PATCH") {
        requestBody = await readBody(req);
        const ticketId = Number(ticketMatch[1]);
        const ticket = db.prepare("SELECT * FROM tickets WHERE id=?").get(ticketId);
        if (!ticket) return respond(res, 404, { error: "Ticket not found" });
        const nextStatus = String(requestBody.status || "").trim().toLowerCase();
        if (!["open", "closed"].includes(nextStatus)) {
          return respond(res, 400, { error: "status must be open or closed" });
        }
        db.prepare("UPDATE tickets SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(nextStatus, ticketId);
        const saved = db.prepare("SELECT * FROM tickets WHERE id=?").get(ticketId);
        const summary = attachTicketMedia(saved);
        summary.spoken_summary = nextStatus === "closed"
          ? `Evidence ticket ${saved.ticket_code} closed.`
          : `Evidence ticket ${saved.ticket_code} reopened.`;
        return respond(res, 200, summary);
      }

      if ((url.pathname === "/api/support/sessions" || url.pathname === "/api/support/start") && req.method === "POST") {
        requestBody = await readBody(req);
        const body = requestBody;
        const description = String(body.description || "Remote support request from AI glasses").trim();
        const device = normalizeDevice(body.device || parseDevice(req, url));
        const sessionId = String(body.session_id || req.headers["x-lab-session"] || "").trim();
        const callCode = nextSupportCallCode(db);
        const result = db.prepare(`
          INSERT INTO support_calls(call_code,room_code,description,status,call_phase,request_type,device,session_id,expert_label)
          VALUES(?,?,?,?,?,?,?,?,?)
        `).run(callCode, String(body.room_code || "").trim().toUpperCase(), description, "active", "waiting", "remote_support", device, sessionId, "");
        const call = supportCallRow(db, Number(result.lastInsertRowid));
        appendSupportCallMessage(db, call.id, "system", "Expert engineer request opened. Ringing Mission Control.");
        const summary = supportCallListItem(call);
        summary.spoken_summary = `Expert engineer request ${call.call_code} sent. Mission Control is ringing.`;
        summary.ring = true;
        return respond(res, 201, summary);
      }
      if (url.pathname === "/api/support/sessions" && req.method === "GET") {
        const phase = String(url.searchParams.get("phase") || url.searchParams.get("status") || "all").trim();
        let rows;
        if (phase === "all") {
          rows = db.prepare(`
            SELECT c.*, t.ticket_code FROM support_calls c
            LEFT JOIN tickets t ON t.id = c.ticket_id
            ORDER BY c.id DESC LIMIT 50
          `).all();
        } else {
          rows = db.prepare(`
            SELECT c.*, t.ticket_code FROM support_calls c
            LEFT JOIN tickets t ON t.id = c.ticket_id
            WHERE c.call_phase=? OR c.status=?
            ORDER BY c.id DESC LIMIT 50
          `).all(phase, phase);
        }
        return respond(res, 200, rows.map(supportCallListItem));
      }
      const supportMatch = url.pathname.match(/^\/api\/support\/sessions\/(\d+)(\/(accept|messages|end))?$/);
      if (supportMatch) {
        const callId = Number(supportMatch[1]);
        const action = supportMatch[3] || "";
        const call = supportCallRow(db, callId);
        if (!call && req.method !== "POST") return respond(res, 404, { error: "Support call not found" });

        if (action === "accept" && req.method === "POST") {
          requestBody = await readBody(req);
          const expertLabel = String(requestBody.expert_label || "Expert engineer").trim();
          db.prepare("UPDATE support_calls SET call_phase='live', expert_label=? WHERE id=?").run(expertLabel, callId);
          appendSupportCallMessage(db, callId, "expert", `${expertLabel} answered the call.`);
          const updated = supportCallRow(db, callId);
          const summary = supportCallListItem(updated);
          summary.spoken_summary = supportCallSummary(updated);
          if (updated.room_code) summary.webrtc_viewer_url = buildWebRtcViewerUrl(updated.room_code);
          return respond(res, 200, summary);
        }

        if (action === "messages" && req.method === "GET") {
          return respond(res, 200, supportCallMessages(db, callId));
        }
        if (action === "messages" && req.method === "POST") {
          requestBody = await readBody(req);
          const sender = String(requestBody.sender || (parseDevice(req, url) === "web" ? "expert" : "field")).trim();
          const saved = appendSupportCallMessage(db, callId, sender, requestBody.message);
          return respond(res, 201, saved);
        }

        if (action === "end" && req.method === "POST") {
          requestBody = await readBody(req);
          if (!call) return respond(res, 404, { error: "Support call not found" });
          if (call.status === "ended") return respond(res, 409, { error: "Support call already ended" });
          const body = requestBody || {};
          let ticketResult;
          try {
            ticketResult = finalizeSupportCallTicket(db, call, {
              ...body,
              ticket_type: "remote_support",
              allow_empty_evidence: true,
            });
          } catch (error) {
            ticketResult = finalizeSupportCallTicket(db, call, {
              ...body,
              evidence_type: "video",
              video_frames: Array.isArray(body.video_frames) ? body.video_frames : [],
              ticket_type: "remote_support",
              allow_empty_evidence: true,
            });
          }
          appendSupportCallMessage(db, callId, "system", `Support call ended. Evidence ticket ${ticketResult.ticket_code} created.`);
          const updated = supportCallRow(db, callId);
          return respond(res, 200, {
            ...supportCallListItem(updated),
            ...ticketResult,
            spoken_summary: `Support call ended. Ticket ${ticketResult.ticket_code} recorded with session evidence.`,
          });
        }

        if (req.method === "GET") {
          const summary = supportCallListItem(call);
          summary.spoken_summary = supportCallSummary(call);
          if (url.searchParams.get("include_messages") === "1") summary.messages = supportCallMessages(db, callId);
          if (call.room_code) summary.webrtc_viewer_url = buildWebRtcViewerUrl(call.room_code);
          return respond(res, 200, summary);
        }

        if (req.method === "PATCH") {
          requestBody = await readBody(req);
          const roomCode = String(requestBody.room_code || "").trim().toUpperCase();
          if (!roomCode) return respond(res, 400, { error: "room_code is required" });
          db.prepare("UPDATE support_calls SET room_code=? WHERE id=?").run(roomCode, callId);
          appendSupportCallMessage(db, callId, "system", `Video room ${roomCode} is ready.`);
          const updated = supportCallRow(db, callId);
          const summary = supportCallListItem(updated);
          summary.spoken_summary = supportCallSummary(updated);
          return respond(res, 200, summary);
        }
      }

      const legacySupportMatch = url.pathname.match(/^\/api\/support\/(\d+)$/);
      if (legacySupportMatch && req.method === "PATCH") {
        requestBody = await readBody(req);
        const callId = Number(legacySupportMatch[1]);
        const call = supportCallRow(db, callId);
        if (!call) return respond(res, 404, { error: "Support call not found" });
        const roomCode = String(requestBody.room_code || requestBody.roomCode || "").trim().toUpperCase();
        if (!roomCode) return respond(res, 400, { error: "room_code is required" });
        db.prepare("UPDATE support_calls SET room_code=? WHERE id=?").run(roomCode, callId);
        appendSupportCallMessage(db, callId, "system", `Video room ${roomCode} is ready.`);
        const updated = supportCallRow(db, callId);
        const summary = supportCallListItem(updated);
        summary.spoken_summary = supportCallSummary(updated);
        return respond(res, 200, summary);
      }

      if (url.pathname === "/api/support/end" && req.method === "POST") {
        requestBody = await readBody(req);
        const callId = Number(requestBody.support_call_id || requestBody.id || 0);
        if (!callId) return respond(res, 400, { error: "support_call_id is required" });
        const call = supportCallRow(db, callId);
        if (!call) return respond(res, 404, { error: "Support call not found" });
        if (call.status === "ended") {
          const existingTicket = call.ticket_id
            ? db.prepare("SELECT * FROM tickets WHERE id=?").get(call.ticket_id)
            : null;
          return respond(res, 200, {
            ...supportCallListItem(call),
            ticket: existingTicket ? ticketListItem(existingTicket) : null,
            ticket_code: existingTicket?.ticket_code || "",
            spoken_summary: existingTicket
              ? `Support call already ended. Ticket ${existingTicket.ticket_code} is on file.`
              : "Support call already ended.",
          });
        }
        const cappedBody = {
          ...requestBody,
          ticket_type: "remote_support",
          allow_empty_evidence: true,
          video_frames: Array.isArray(requestBody.video_frames)
            ? requestBody.video_frames.slice(0, 40)
            : requestBody.video_frames,
        };
        let ticketResult;
        try {
          ticketResult = finalizeSupportCallTicket(db, call, cappedBody);
        } catch (error) {
          ticketResult = finalizeSupportCallTicket(db, call, {
            ...cappedBody,
            evidence_type: "video",
            video_frames: Array.isArray(cappedBody.video_frames) ? cappedBody.video_frames : [],
            allow_empty_evidence: true,
          });
        }
        appendSupportCallMessage(db, callId, "system", `Support call ended. Evidence ticket ${ticketResult.ticket_code} created.`);
        const updated = supportCallRow(db, callId);
        return respond(res, 200, {
          ...supportCallListItem(updated),
          ...ticketResult,
          spoken_summary: `Support call ended. Ticket ${ticketResult.ticket_code} recorded.`,
        });
      }

      if (url.pathname === "/api/lookup" && req.method === "GET") {
        const name = String(url.searchParams.get("name") || "").trim();
        if (!name) return respond(res, 400, { error: "Name is required" });
        const match = db.prepare("SELECT id FROM people WHERE consent=1 AND name LIKE ? ORDER BY CASE WHEN lower(name)=lower(?) THEN 0 ELSE 1 END, name LIMIT 1").get(`%${name}%`, name);
        if (!match) return respond(res, 404, { error: "No consented person found" });
        const person = personWithProjects(db, match.id);
        const active = person.projects.filter(project => !["Completed", "On hold"].includes(project.status));
        person.spoken_summary = active.length
          ? `${person.name}${person.title ? `, ${person.title}` : ""}. Current projects: ${active.map(project => project.name).join(", ")}.`
          : `${person.name}${person.title ? `, ${person.title}` : ""}. No active projects are recorded.`;
        return respond(res, 200, person);
      }
      if (url.pathname === "/api/people" && req.method === "GET") {
        const q = `%${url.searchParams.get("q") || ""}%`;
        const rows = db.prepare(`SELECT p.*, COUNT(pr.id) project_count FROM people p LEFT JOIN projects pr ON pr.person_id=p.id WHERE p.name LIKE ? OR p.company LIKE ? OR p.title LIKE ? GROUP BY p.id ORDER BY p.name COLLATE NOCASE`).all(q, q, q);
        rows.forEach(row => row.consent = Boolean(row.consent));
        return respond(res, 200, rows);
      }
      if (url.pathname === "/api/people" && req.method === "POST") {
        const p = cleanPerson(await readBody(req));
        const result = db.prepare("INSERT INTO people(name,title,company,email,phone,notes,photo,video,consent) VALUES(?,?,?,?,?,?,?,?,?)").run(p.name,p.title,p.company,p.email,p.phone,p.notes,p.photo,p.video,p.consent);
        return respond(res, 201, personWithProjects(db, Number(result.lastInsertRowid)));
      }
      if (url.pathname === "/api/enroll" && req.method === "POST") {
        const body = await readBody(req);
        if (body.consentConfirmed !== true) return respond(res, 400, { error: "The person's consent must be confirmed" });
        const p = cleanPerson({ ...body, consent: true });
        if (!p.photo) return respond(res, 400, { error: "A current photo is required" });
        const duplicate = db.prepare("SELECT id FROM people WHERE lower(name)=lower(?) AND lower(company)=lower(?) LIMIT 1").get(p.name, p.company);
        if (duplicate) return respond(res, 409, { error: "A matching person already exists", person: personWithProjects(db, duplicate.id) });
        let personId;
        db.exec("BEGIN");
        try {
          const result = db.prepare("INSERT INTO people(name,title,company,email,phone,notes,photo,video,consent) VALUES(?,?,?,?,?,?,?,?,1)").run(p.name,p.title,p.company,p.email,p.phone,p.notes,p.photo,p.video);
          personId = Number(result.lastInsertRowid);
          const projects = Array.isArray(body.projects) ? body.projects : [];
          for (const projectInput of projects) {
            const project = cleanProject(projectInput);
            db.prepare("INSERT INTO projects(person_id,name,status,description) VALUES(?,?,?,?)").run(personId,project.name,project.status,project.description);
          }
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        const person = personWithProjects(db, personId);
        return respond(res, 201, { ...person, spoken_summary: `${person.name} from ${person.company || "the lab"} was added to the lab staff database.` });
      }
      const personMatch = url.pathname.match(/^\/api\/people\/(\d+)$/);
      if (personMatch) {
        const id = Number(personMatch[1]);
        if (req.method === "GET") {
          const person = personWithProjects(db, id);
          return person ? respond(res, 200, person) : respond(res, 404, { error: "Person not found" });
        }
        if (req.method === "PUT") {
          if (!personWithProjects(db, id)) return respond(res, 404, { error: "Person not found" });
          const p = cleanPerson(await readBody(req));
          db.prepare("UPDATE people SET name=?,title=?,company=?,email=?,phone=?,notes=?,photo=?,video=?,consent=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(p.name,p.title,p.company,p.email,p.phone,p.notes,p.photo,p.video,p.consent,id);
          return respond(res, 200, personWithProjects(db, id));
        }
        if (req.method === "DELETE") {
          const result = db.prepare("DELETE FROM people WHERE id=?").run(id);
          return result.changes ? respond(res, 200, { ok: true }) : respond(res, 404, { error: "Person not found" });
        }
      }
      const projectsMatch = url.pathname.match(/^\/api\/people\/(\d+)\/projects$/);
      if (projectsMatch && req.method === "POST") {
        const personId = Number(projectsMatch[1]);
        if (!personWithProjects(db, personId)) return respond(res, 404, { error: "Person not found" });
        const p = cleanProject(await readBody(req));
        const result = db.prepare("INSERT INTO projects(person_id,name,status,description) VALUES(?,?,?,?)").run(personId,p.name,p.status,p.description);
        return respond(res, 201, db.prepare("SELECT * FROM projects WHERE id=?").get(Number(result.lastInsertRowid)));
      }
      const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
      if (projectMatch && req.method === "DELETE") {
        const result = db.prepare("DELETE FROM projects WHERE id=?").run(Number(projectMatch[1]));
        return result.changes ? respond(res, 200, { ok: true }) : respond(res, 404, { error: "Project not found" });
      }

      // Live status probe for twin indicator overlays (avoids browser CORS)
      if (url.pathname === "/api/status-check" && req.method === "GET") {
        const target = String(url.searchParams.get("url") || "").trim();
        if (!/^https?:\/\//i.test(target)) return respond(res, 400, { error: "url must be http(s)", live: "red", ok: false });
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          const upstream = await fetch(target, {
            method: "GET",
            signal: controller.signal,
            headers: { Accept: "application/json, text/plain, */*", "User-Agent": "ab-twin-status-check" },
          });
          clearTimeout(timer);
          const text = await upstream.text();
          let payload = null;
          try { payload = JSON.parse(text); } catch { payload = null; }
          const live = interpretLiveStatus(upstream.status, payload, text);
          return respond(res, 200, {
            ok: live === "green",
            live,
            http_status: upstream.status,
            message: live === "green" ? "Healthy" : "Unhealthy",
            sample: String(text || "").slice(0, 180),
          });
        } catch (err) {
          return respond(res, 200, {
            ok: false,
            live: "red",
            http_status: 0,
            message: err.message || "Request failed",
          });
        }
      }

      // ab-twin — Digital Twin from AI-glasses video
      if (url.pathname === "/api/twins" && req.method === "GET") {
        return respond(res, 200, twinPipeline.listTwins());
      }
      if (url.pathname === "/api/twins" && req.method === "POST") {
        requestBody = await readBody(req);
        const body = requestBody;
        const video = body.video || body.video_data || body.evidence_data;
        const videoFrames = Array.isArray(body.video_frames) ? body.video_frames : [];
        if (!video && !videoFrames.length) return respond(res, 400, { error: "video or video_frames is required" });
        try {
          const status = twinPipeline.createTwinJob({
            title: body.title,
            description: body.description,
            videoDataUrl: video,
            videoFrames,
            device: normalizeDevice(body.device || parseDevice(req, url)),
            sessionId: String(body.session_id || req.headers["x-lab-session"] || "").trim(),
            labName: body.lab_name || body.labName,
          });
          return respond(res, 201, {
            ...status,
            spoken_summary: `Digital twin job ${status.twin_id} started. Capture is processing into a navigable lab twin.`,
          });
        } catch (err) {
          return respond(res, 400, { error: err.message });
        }
      }
      const twinMatch = url.pathname.match(/^\/api\/twins\/(TWIN-[\w-]+)(?:\/(frames|exports|overlays)(?:\/([^/]+))?)?$/);
      if (twinMatch) {
        const twinId = twinMatch[1];
        const section = twinMatch[2];
        const fileName = twinMatch[3] ? decodeURIComponent(twinMatch[3]) : null;
        try {
          if (!section && req.method === "GET") return respond(res, 200, twinPipeline.getTwin(twinId));
          if (section === "overlays" && req.method === "GET") {
            return respond(res, 200, { twin_id: twinId, overlays: twinPipeline.listOverlays(twinId) });
          }
          if (section === "overlays" && (req.method === "PUT" || req.method === "POST")) {
            requestBody = await readBody(req);
            const overlays = twinPipeline.saveOverlays(twinId, requestBody.overlays || requestBody);
            return respond(res, 200, { twin_id: twinId, overlays, spoken_summary: `${overlays.length} overlays saved on twin.` });
          }
          if (section === "frames" && !fileName && req.method === "GET") {
            return respond(res, 200, twinPipeline.listFrames(twinId));
          }
          if (section === "frames" && fileName && req.method === "GET") {
            skipLog = true;
            const file = twinPipeline.resolveFrameFile(twinId, fileName);
            res.writeHead(200, { "Content-Type": "image/jpeg", "Access-Control-Allow-Origin": "*" });
            return fs.createReadStream(file).pipe(res);
          }
          if (section === "exports" && fileName && req.method === "GET") {
            skipLog = true;
            const file = twinPipeline.resolveExportFile(twinId, fileName);
            const ext = path.extname(fileName).toLowerCase();
            const type = ext === ".ply" ? "application/octet-stream"
              : ext === ".mp4" ? "video/mp4"
              : ext === ".json" ? "application/json"
              : "application/octet-stream";
            const stat = fs.statSync(file);
            res.writeHead(200, {
              "Content-Type": type,
              "Content-Length": stat.size,
              "Accept-Ranges": "bytes",
              "Access-Control-Allow-Origin": "*",
            });
            return fs.createReadStream(file).pipe(res);
          }
        } catch (err) {
          return respond(res, err.message.includes("not found") || err.message.includes("Not found") ? 404 : 400, { error: err.message });
        }
      }

      if (url.pathname.startsWith("/api/")) return respond(res, 404, { error: "Not found" });

      skipLog = true;
      const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const file = path.resolve(publicDir, relative);
      if (!file.startsWith(path.resolve(publicDir)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end("Not found");
      }
      const types = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"application/javascript; charset=utf-8", ".svg":"image/svg+xml", ".ply":"application/octet-stream", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png" };
      res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      respond(res, /required|Invalid|large|Photo|Video/.test(error.message) ? 400 : 500, { error: error.message });
    } finally {
      finish();
    }
  };
}

function startServer({ port = Number(process.env.PORT || 8090), db = openDatabase() } = {}) {
  const closed = closeAbandonedSupportCalls(db, { maxAgeMinutes: 15 });
  if (closed) console.log(`Closed ${closed} abandoned Expert Engineer call(s); evidence tickets left open.`);
  // Periodically close abandoned live sessions (call over → leave In Progress).
  setInterval(() => {
    try { closeAbandonedSupportCalls(db, { maxAgeMinutes: 15 }); } catch { /* ignore */ }
  }, 60_000).unref?.();
  const server = http.createServer(createHandler(db));
  return new Promise(resolve => server.listen(port, "0.0.0.0", () => resolve(server)));
}

if (require.main === module) startServer().then(server => console.log(`LAB VISION demos: http://localhost:${server.address().port}`));

module.exports = {
  openDatabase, createHandler, startServer, DEMO_AGENTS, seedDemoData,
  insertLog, buildLogEntry, normalizeDevice, closeAbandonedSupportCalls,
};
