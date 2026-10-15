const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const api = async (url, options = {}) => {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
};
const esc = s => String(s || "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const attr = s => String(s || "").replace(/"/g, "&quot;");
const toast = message => { const t = $("#toast"); t.textContent = message; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2200); };

function openModal(title, html, bind) {
  const root = $("#modalRoot");
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = html;
  root.classList.remove("hidden");
  root.setAttribute("aria-hidden", "false");
  root.querySelectorAll("[data-close-modal]").forEach(el => { el.onclick = closeModal; });
  bind?.();
}

function closeModal() {
  const root = $("#modalRoot");
  root.classList.add("hidden");
  root.setAttribute("aria-hidden", "true");
  $("#modalBody").innerHTML = "";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function formatLogTime(value) {
  const d = new Date(String(value).includes("T") ? value : String(value).replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return value || "—";
  return d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatSessionStamp(value) {
  const d = new Date(String(value).includes("T") ? value : String(value).replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return value || "—";
  return d.toLocaleString([], {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function deviceBadge(device) {
  const labels = { "ray-ban": "Ray-Ban Meta", iphone: "iPhone", mobile: "Mobile camera", web: "Web console", unknown: "Unknown" };
  return labels[device] || device;
}

function logLevelClass(level) {
  return ({ success: "log-ok", error: "log-error", warn: "log-warn", info: "log-info" }[level] || "log-info");
}

function logRow(entry) {
  return `<article class="log-row ${logLevelClass(entry.level)}" data-id="${entry.id}">
    <div class="log-meta">
      <time>${esc(formatLogTime(entry.created_at))}</time>
      <span class="log-device">${esc(deviceBadge(entry.device))}</span>
      <span class="log-command">${esc(entry.command || entry.event_type)}</span>
      <span class="log-status ${entry.status_code >= 400 ? "bad" : "good"}">${entry.status_code || "—"}</span>
      <span class="log-ms">${entry.duration_ms}ms</span>
    </div>
    <div class="log-body">
      <div><strong>Request</strong> ${esc(entry.request_summary || entry.method + " " + entry.path + entry.query)}</div>
      <div><strong>Response</strong> ${esc(entry.response_summary || "—")}</div>
      <div class="log-agent">${esc(entry.agent)} · ${esc(entry.event_type)}</div>
    </div>
  </article>`;
}

function agentChip(agent) {
  const name = agent.agent_name || agent.label || deviceBadge(agent.device);
  const page = agent.page || "";
  const loc = agent.location || "";
  const started = formatSessionStamp(agent.connected_at);
  const seen = formatSessionStamp(agent.last_seen_at);
  return `<article class="connected-agent" data-session="${attr(agent.session_id || "")}">
    <span class="status-dot"></span>
    <div class="connected-agent-body">
      <strong>${esc(name)}</strong>
      <small>${esc(deviceBadge(agent.device))}${page ? ` · ${esc(page)}` : ""}</small>
      <small>Session ${esc(started)}</small>
      <small>Last seen ${esc(seen)}${loc ? ` · ${esc(loc)}` : ""}</small>
    </div>
    <span class="route-badge">${esc(agent.status || "connected")}</span>
  </article>`;
}

function logsView() {
  return `<div class="page-head">
    <div><h1>Agent Runtime</h1><p>Live command routing, device connections, API requests, and failures from lab glasses or mobile agents.</p></div>
    <div class="log-actions">
      <button class="secondary compact" id="refreshLogs">Refresh</button>
      <button class="secondary compact" id="clearLogs">Clear logs</button>
    </div>
  </div>
  <section class="connected-panel">
    <div class="connected-head"><h2>Connected agents</h2><span class="count"><strong id="agentCount">${connectedAgents.length}</strong> active</span></div>
    <div class="connected-list" id="connectedAgents">${connectedAgents.length ? connectedAgents.map(agentChip).join("") : '<p class="muted empty-connected">No Ray-Ban or mobile agent connected yet.</p>'}</div>
  </section>
  <section class="log-panel">
    <div class="connected-head"><h2>Activity log</h2><span class="live-pill"><span class="status-dot"></span> Live</span></div>
    <div class="log-stream" id="logStream">${logs.length ? logs.map(logRow).join("") : '<p class="muted log-empty">Waiting for agent commands…</p>'}</div>
  </section>`;
}

async function loadAgentStatus() {
  const status = await api("/api/agents/status");
  connectedAgents = status.agents || [];
  const statusEl = document.querySelector(".agent-status-label");
  if (statusEl) statusEl.textContent = connectedAgents.length ? `${connectedAgents.length} agent(s) connected` : "Waiting for agent connection";
}

async function loadLogs(initial = false) {
  const rows = await api(`/api/logs?since=${initial ? 0 : lastLogId}&limit=200`);
  if (initial) logs = rows;
  else if (rows.length) logs = [...logs, ...rows].slice(-300);
  if (logs.length) lastLogId = Math.max(lastLogId, ...logs.map(row => row.id));
}

function appendLog(entry) {
  if (logs.some(row => row.id === entry.id)) return;
  logs.push(entry);
  if (logs.length > 300) logs = logs.slice(-300);
  lastLogId = Math.max(lastLogId, entry.id);
  if (currentView !== "logs") return;
  const stream = $("#logStream");
  if (!stream) return;
  stream.querySelector(".log-empty")?.remove();
  stream.insertAdjacentHTML("beforeend", logRow(entry));
  stream.scrollTop = stream.scrollHeight;
  if (shouldTrackAgentEntry(entry)) loadAgentStatus().then(updateLogsSidebar).catch(() => {});
}

function shouldTrackAgentEntry(entry) {
  return ["/api/inventory/lookup", "/api/knowledge/lookup", "/api/tests/start", "/api/agents/connect", "/api/tickets"].some(path => entry.path === path);
}

function stopLogStream() {
  if (logStream) { logStream.close(); logStream = null; }
  if (logPollTimer) { clearInterval(logPollTimer); logPollTimer = null; }
}

function startLogStream() {
  stopLogStream();
  if (typeof EventSource !== "undefined") {
    logStream = new EventSource("/api/logs/stream");
    logStream.onmessage = e => { try { appendLog(JSON.parse(e.data)); } catch {} };
    logStream.onerror = () => { stopLogStream(); logPollTimer = setInterval(refreshLogsQuiet, 3000); };
  } else {
    logPollTimer = setInterval(refreshLogsQuiet, 2000);
  }
}

async function refreshLogsQuiet() {
  try {
    await loadLogs(false);
    await loadAgentStatus();
    if (currentView === "logs") updateLogsSidebar();
  } catch {}
}

function updateLogsSidebar() {
  const list = $("#connectedAgents");
  const count = $("#agentCount");
  if (list) list.innerHTML = connectedAgents.length ? connectedAgents.map(agentChip).join("") : '<p class="muted empty-connected">No Ray-Ban or mobile agent connected yet.</p>';
  if (count) count.textContent = connectedAgents.length;
}

function bindLogs() {
  $("#refreshLogs").onclick = async () => { await loadLogs(true); await loadAgentStatus(); render(); bindLogs(); toast("Logs refreshed"); };
  $("#clearLogs").onclick = async () => {
    if (!confirm("Clear all activity logs?")) return;
    await api("/api/logs", { method: "DELETE" });
    logs = []; lastLogId = 0; render(); bindLogs(); toast("Logs cleared");
  };
  const stream = $("#logStream");
  if (stream) stream.scrollTop = stream.scrollHeight;
  startLogStream();
}

let demos = [], inventory = [], knowledge = [], tests = [], tickets = [], supportCalls = [], twins = [], taskBoard = null, currentView = "chat";
let ticketFilter = "all"; // all | remote_support | evidence
let supportShowAllTickets = false;
let platformConfig = { webrtc_viewer_url: "/support-viewer.html", webrtc_signal_url: "wss://visionclaw-signaling.fly.dev" };
let activeSupportId = null;
let supportPollTimer = null;
let incomingPollTimer = null;
let knownSupportIds = new Set();
let supportIdsSeeded = false;
let ringingCallId = null;
let ringTimer = null;
let audioCtx = null;
let liveRoomCode = "";
let liveViewerMounted = false;
let logs = [], connectedAgents = [], lastLogId = 0, logStream = null, logPollTimer = null;
let sessionQuery = "";
let chatBusy = false;
const chatThreads = Object.create(null);
const ticketVideoCache = new Map();

const AGENT_CHAT_VIEWS = new Set([
  "chat", "inventory", "knowledge", "tests",
  "mobile-ps", "ab-twin", "tickets", "support",
]);

const TOOL_SESSIONS = [
  { id: "chat", title: "Mission Control (Lab Manager)", preview: "Lab manager chat · local lab DB", initials: "LM", tone: 3 },
  { id: "overview", title: "AI Glasses", preview: "UAELAB AI Assistant · agent roster", initials: "AI", tone: 0 },
  { id: "dashboard", title: "Dashboard", preview: "Queue depth and agent execution", initials: "DB", tone: 3 },
  { id: "agents", title: "Agents", preview: "All demo agents and routing", initials: "AG", tone: 2 },
  { id: "logs", title: "Agent Runtime", preview: "Live command routing and failures", initials: "RT", tone: 4 },
  { id: "kanban", title: "Kanban", preview: "In Progress · Complete", initials: "KB", tone: 5 },
];

const VIEW_META = {
  chat: { title: "Mission Control (Lab Manager)", subtitle: "Lab manager · tickets, agents, and local lab database" },
  overview: { title: "AI Glasses", subtitle: "UAELAB AI Assistant · lab agents" },
  dashboard: { title: "Dashboard", subtitle: "Agents executing and completed tasks" },
  kanban: { title: "Kanban", subtitle: "In progress execution and completed tasks" },
  agents: { title: "Agents", subtitle: "Open any agent workflow from the list" },
  inventory: { title: "Lab Inventory Agent", subtitle: "Equipment location and stock queries" },
  knowledge: { title: "Lab Knowledge Assistant", subtitle: "Procedures, validation, and documentation" },
  tests: { title: "Run Test", subtitle: "Start and monitor lab validation tests" },
  "mobile-ps": { title: "Mobile PS Agent", subtitle: "Dual-UE packet core upgrade validation" },
  "ab-twin": { title: "Digital Capture", subtitle: "Walk-through capture · Gaussian splatting" },
  logs: { title: "Agent Runtime", subtitle: "Live command routing and device connections" },
  tickets: { title: "Evidence Ticket Agent", subtitle: "Tracked tickets with screenshot or video proof" },
  support: { title: "Expert Engineer Agent", subtitle: "Live expert engineer video from AI glasses" },
};

function chatThreadKey(view = currentView) {
  return AGENT_CHAT_VIEWS.has(view) ? view : "chat";
}

function getChatMessages(view = currentView) {
  const key = chatThreadKey(view);
  if (!chatThreads[key]) chatThreads[key] = [];
  return chatThreads[key];
}

function assistantChatLabel(view = currentView) {
  const key = chatThreadKey(view);
  if (key === "chat") return "Mission Control (Lab Manager)";
  const demo = demos.find(d => d.id === key);
  return demo?.name || VIEW_META[key]?.title || "Agent";
}

function updateComposerPlaceholder() {
  const input = $("#composerInput");
  if (!input) return;
  const key = chatThreadKey(currentView);
  if (key === "chat" || !AGENT_CHAT_VIEWS.has(currentView)) {
    input.placeholder = "Reply to Lab Manager…";
    return;
  }
  const name = assistantChatLabel(key);
  input.placeholder = `Reply to ${name}…`;
}

function initialsFrom(name) {
  return String(name || "AI").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "AI";
}

function sessionTimeLabel() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function demoSessions() {
  return demos.map((d, i) => ({
    id: d.id,
    title: d.name.replace(/\s+Agent$/, "").replace(/^ab-twin\s*[—–-]?\s*/i, ""),
    preview: d.example || d.description || "",
    initials: initialsFrom(d.label || d.name),
    tone: (i + 1) % 7,
  }));
}

function allSessions() {
  return [...TOOL_SESSIONS, ...demoSessions().filter(s => !TOOL_SESSIONS.some(t => t.id === s.id))];
}

function sessionItemMarkup(s, index) {
  const active = s.id === currentView;
  const q = sessionQuery.trim().toLowerCase();
  if (q && ![s.title, s.preview, s.id].join(" ").toLowerCase().includes(q)) return "";
  return `<button type="button" class="session-item${active ? " active" : ""}" data-view="${attr(s.id)}">
    <span class="session-avatar tone-${s.tone ?? (index % 7)}" aria-hidden="true">${esc(s.initials)}</span>
    <span class="session-meta">
      <strong>${esc(s.title)}</strong>
      <p class="session-preview">${esc(s.preview)}</p>
    </span>
    <span class="session-time">${esc(sessionTimeLabel())}</span>
  </button>`;
}

function renderSidebar() {
  const nav = $("#nav");
  if (!nav) return;
  const tools = TOOL_SESSIONS.map((s, i) => sessionItemMarkup(s, i)).join("");
  const agents = demoSessions().map((s, i) => sessionItemMarkup(s, i + TOOL_SESSIONS.length)).join("");
  nav.innerHTML = `
    <div class="session-section">Workspace</div>
    ${tools || '<p class="muted" style="padding:8px">No sessions</p>'}
    <div class="session-section">Agents</div>
    ${agents || '<p class="muted" style="padding:8px">Loading agents…</p>'}
  `;
  nav.querySelectorAll(".session-item").forEach(btn => {
    btn.onclick = () => showView(btn.dataset.view);
  });
}

function updateChatHeader() {
  const meta = VIEW_META[currentView] || {};
  const demo = demos.find(d => d.id === currentView);
  const title = demo?.name || meta.title || "Mission Control (Lab Manager)";
  const subtitle = demo?.description || meta.subtitle || "";
  const titleEl = $("#chatTitle");
  const subEl = $("#chatSubtitle");
  const onlineEl = $("#chatOnlineLabel");
  const identity = $(".chat-identity-avatar");
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = subtitle;
  if (onlineEl) onlineEl.textContent = "Online Now";
  if (identity) {
    identity.textContent = initialsFrom(demo?.label || demo?.name || title);
  }
  const markHost = $("#chatAgentMark");
  if (markHost) {
    const markId = demo?.id
      || (["tests", "chat", "agents"].includes(currentView) ? (currentView === "agents" ? "chat" : currentView) : "");
    if (markId) {
      markHost.innerHTML = agentMarkHtml(markId, "sm");
      markHost.classList.remove("hidden");
    } else {
      markHost.innerHTML = "";
      markHost.classList.add("hidden");
    }
  }
  updateComposerPlaceholder();
}

/** OpenAI-style orbiting-dot mark — unique palette + motion per agent. */
const AGENT_MARK = {
  inventory: { theme: "mint", motion: "orbit" },
  knowledge: { theme: "sky", motion: "breathe" },
  "mobile-ps": { theme: "amber", motion: "spin" },
  tests: { theme: "lime", motion: "wave" },
  tickets: { theme: "rose", motion: "pulse" },
  support: { theme: "emerald", motion: "orbit-rev" },
  "ab-twin": { theme: "violet", motion: "spark" },
  chat: { theme: "slate", motion: "breathe" },
};

function agentMarkHtml(agentId, size = "md") {
  const conf = AGENT_MARK[agentId] || { theme: "mint", motion: "orbit" };
  const dots = Array.from({ length: 8 }, (_, i) => `<span class="openai-dot d${i + 1}"></span>`).join("");
  return `<div class="agent-mark size-${size} theme-${conf.theme} motion-${conf.motion}" data-agent="${attr(agentId)}" aria-hidden="true">
    <div class="agent-mark-orbit">${dots}</div>
    <span class="agent-mark-core"></span>
  </div>`;
}

function agentPageHead(demo, { title, description, actions = "" } = {}) {
  const id = demo?.id || currentView;
  const name = title || demo?.name || VIEW_META[id]?.title || "Agent";
  const desc = description ?? demo?.description ?? VIEW_META[id]?.subtitle ?? "";
  const eyebrow = demo ? `${demo.number} · ${demo.label}` : (VIEW_META[id]?.title || "Agent");
  return `<div class="subpage-head">
    <div class="subpage-head-main">
      ${agentMarkHtml(id, "lg")}
      <div>
        <p class="eyebrow">${esc(eyebrow)}</p>
        <h1>${esc(name)}</h1>
        ${desc ? `<p>${esc(desc)}</p>` : ""}
      </div>
    </div>
    ${actions}
  </div>`;
}

function agentCard(d) {
  return `<article class="agent-card" data-view="${d.id}">
    <div class="agent-card-top">
      ${agentMarkHtml(d.id, "md")}
      <div class="agent-label">${esc(d.number)} · ${esc(d.label)}</div>
    </div>
    <h3>${esc(d.name)}</h3>
    <p class="desc">${esc(d.description)}</p>
    <div class="prompt-box">"${esc(d.example)}"</div>
    <div class="tag-row">${(d.tags || []).map(tag => `<span class="tag">${esc(tag)}</span>`).join("")}</div>
  </article>`;
}

function routingRows() {
  return demos.map(d => `<div class="route-row">
    <div class="route-cat">${esc(d.routeCategory)}</div>
    <div class="route-desc">${esc(d.routeDesc)}</div>
    <span class="route-badge${d.routeAgentSecondary ? " secondary" : ""}">${esc(d.routeAgent)}</span>
  </div>`).join("");
}

function connectedAgentsStrip() {
  if (!connectedAgents.length) {
    return `<p class="muted empty-connected">No Ray-Ban or mobile agent connected yet.</p>`;
  }
  return `<div class="connected-list">${connectedAgents.map(agentChip).join("")}</div>`;
}

function boardColumns() {
  const cols = taskBoard?.columns || [
    { id: "in_progress", label: "In Progress", color: "amber", count: 0, items: [] },
    { id: "complete", label: "Complete", color: "green", count: 0, items: [] },
  ];
  return cols.filter(c => c.id === "in_progress" || c.id === "complete");
}

function boardCol(id) {
  const all = taskBoard?.columns || [];
  return all.find(c => c.id === id) || boardColumns().find(c => c.id === id) || { count: 0, items: [] };
}

function kindLabel(kind) {
  return ({ support: "Support", test: "Test", ticket: "Ticket", twin: "Capture" })[kind] || kind || "Task";
}

function agentTypeLabel(item) {
  const map = {
    "expert-engineer-agent": "Expert Engineer Agent",
    "evidence-ticket-agent": "Evidence Ticket Agent",
    "lab-test-agent": "Lab Test Agent",
    "ab-twin-agent": "Digital Capture Agent",
    "lab-inventory-agent": "Lab Inventory Agent",
    "lab-knowledge-agent": "Lab Knowledge Assistant",
  };
  return map[item.agent] || item.agent || kindLabel(item.kind);
}

function taskCard(item) {
  return `<article class="task-card" data-view="${attr(item.view || "")}" data-kind="${attr(item.kind || "")}">
    <div class="task-card-top">
      <span class="task-kind">${esc(kindLabel(item.kind))}</span>
      <span class="task-meta">${esc(item.meta || "")}</span>
    </div>
    <h3>${esc(item.title)}</h3>
    <p>${esc(item.summary)}</p>
    <div class="task-card-foot">
      <span class="chip ok">${esc(agentTypeLabel(item))}</span>
      <span class="chip">${esc(item.executor || item.device || "—")}</span>
    </div>
  </article>`;
}

function kanbanColumn(col) {
  return `<div class="kanban-col" data-col="${attr(col.id)}">
    <header class="kanban-col-head">
      <span class="kanban-dot ${esc(col.color || "blue")}"></span>
      <strong>${esc(col.label)}</strong>
      <span class="kanban-count">${col.count || 0}</span>
    </header>
    <div class="kanban-cards">
      ${(col.items || []).map(taskCard).join("") || '<p class="muted kanban-empty">Nothing here</p>'}
    </div>
  </div>`;
}

function queueStatsStrip() {
  const active = boardCol("in_progress").count || 0;
  const done = boardCol("complete").count || 0;
  const agents = taskBoard?.agents || connectedAgents;
  return `<section class="queue-stats queue-stats-compact">
    <article class="queue-stat"><span class="queue-stat-label">In Progress</span><strong>${active}</strong><small>live calls & runs</small></article>
    <article class="queue-stat"><span class="queue-stat-label">Complete</span><strong>${done}</strong><small>finished tasks</small></article>
    <article class="queue-stat agents"><span class="queue-stat-label">Agents</span><strong>${agents.length}</strong><small>connected now</small></article>
  </section>`;
}

function executingAgentsPanel() {
  const active = boardCol("in_progress").items || [];
  if (!active.length) {
    return `<section class="connected-panel">
      <div class="connected-head"><h2>Agents executing</h2><span class="count"><strong>0</strong> active tasks</span></div>
      <p class="muted empty-connected">No agents are executing tasks right now.</p>
    </section>`;
  }
  return `<section class="connected-panel">
    <div class="connected-head"><h2>Agents executing</h2><span class="count"><strong>${active.length}</strong> active task${active.length === 1 ? "" : "s"}</span></div>
    <div class="executing-list">${active.map(item => `
      <article class="executing-row executing-detail">
        <span class="status-dot"></span>
        <div class="executing-main">
          <strong>${esc(agentTypeLabel(item))}</strong>
          <small class="executing-type">${esc(kindLabel(item.kind))} · ${esc(item.agent || "agent")}</small>
          <p class="executing-task">${esc(item.title)} — ${esc(item.summary || "")}</p>
          <div class="executing-meta">
            <span class="chip">Executor: ${esc(item.executor || "—")}</span>
            <span class="chip">Device: ${esc(item.device || "—")}</span>
            ${item.meta ? `<span class="chip ok">${esc(item.meta)}</span>` : ""}
          </div>
        </div>
      </article>`).join("")}</div>
  </section>`;
}

function taskBoardMarkup() {
  return `<section class="kanban-board kanban-board-two">${boardColumns().map(kanbanColumn).join("")}</section>`;
}

function chatView() {
  return liveChatMarkup("chat", {
    empty: true,
    hints: true,
  });
}

function formatChatHtml(text) {
  const raw = String(text || "").replace(/\n{3,}/g, "\n\n").trim();
  // Escape first, keep newlines as <br>, then upgrade markdown pipe-tables to smart components.
  let html = esc(raw).replace(/\n/g, "<br>");
  html = html.replace(
    /(\/api\/reports\/[\w.%+-]+\.(?:pptx|csv))/gi,
    '<a class="chat-dl-link" href="$1" download target="_blank" rel="noopener">$1</a>',
  );
  // Light markdown: headings / bold (after escape; newlines are already <br>)
  html = html.replace(/(^|<br>)###\s+(.+?)(?=<br>|$)/g, "$1<strong class=\"msg-h\">$2</strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  if (window.MissionCharts?.renderMarkdownTablesInHtml) {
    html = window.MissionCharts.renderMarkdownTablesInHtml(html);
  }
  return html;
}

function liveChatMarkup(view = currentView, opts = {}) {
  const messages = getChatMessages(view);
  const label = assistantChatLabel(view);
  const initials = initialsFrom(label);
  let lastAssistant = "";
  const chartsLib = window.MissionCharts;
  const body = messages.length
    ? messages.map(m => {
      const role = m.role === "user" ? "user" : "assistant";
      const who = role === "user" ? "You" : (m.agent_name || label);
      const dl = m.download_url || (String(m.content || "").match(/\/api\/reports\/[\w.%+-]+\.pptx/i) || [])[0] || "";
      const excel = m.excel_url || (String(m.content || "").match(/\/api\/reports\/[\w.%+-]+\.csv/i) || [])[0] || "";
      const charts = Array.isArray(m.charts) ? m.charts : [];
      const tables = Array.isArray(m.tables) ? m.tables : [];
      const hasGenui = charts.length > 0 || tables.length > 0;
      const showAvatar = role === "assistant" && who !== lastAssistant;
      if (role === "assistant") lastAssistant = who;
      else lastAssistant = "";
      const exportHtml = chartsLib
        ? chartsLib.analyticsExportsHtml({ download_url: dl, excel_url: excel })
        : `${dl ? `<p class="msg-download"><a class="chat-dl-btn" href="${attr(dl)}" download>Download PPTX</a></p>` : ""}${excel ? `<p class="msg-download"><a class="chat-dl-btn" href="${attr(excel)}" download>Download Excel CSV</a></p>` : ""}`;
      const chartsHtml = chartsLib && charts.length ? chartsLib.chartsMarkup(charts) : "";
      const tablesHtml = chartsLib && tables.length ? chartsLib.tablesMarkup(tables) : "";
      // When we already have a structured smart table, strip leftover markdown pipe tables from text.
      let content = m.content || "";
      if (tables.length) {
        content = content.replace(/(^|\n)\s*\|.+\|(\n\s*\|?\s*:?-{3,}.*)?(\n\s*\|.+\|)*/g, "").trim()
          || `Smart table ready (${tables[0].rows?.length || 0} rows).`;
      }
      return `<div class="msg-row ${role}">
        ${role === "assistant" ? `<div class="msg-avatar-col">${showAvatar ? `<span class="msg-avatar" aria-hidden="true">${esc(initialsFrom(who) || initials)}</span>` : ""}</div>` : ""}
        <div class="msg-stack">
          ${role === "assistant" && showAvatar ? `<div class="msg-meta">${esc(who)}</div>` : ""}
          <div class="msg-bubble ${role}${hasGenui ? " has-genui" : ""}">
            <div class="msg-text">${formatChatHtml(content)}</div>
            ${exportHtml}
            ${tablesHtml}
            ${chartsHtml}
          </div>
        </div>
      </div>`;
    }).join("")
    : (opts.empty
      ? `<div class="chat-empty">
      <div class="msg-row assistant">
        <div class="msg-avatar-col"><span class="msg-avatar" aria-hidden="true">${esc(initials)}</span></div>
        <div class="msg-stack">
          <div class="msg-meta">${esc(label)}</div>
          <div class="msg-bubble assistant">
            <div class="msg-text">${view === "chat"
              ? "Hi — I am UAELAB AI Assistant. Ask “how can you help” for the full agent list, or try a ticket table, bar chart, or inventory lookup."
              : `Hi — I’m ${esc(label)}. Ask about this workflow.`}</div>
          </div>
        </div>
      </div>
      ${opts.hints ? `<div class="chat-hint-row">
        <button type="button" class="chat-chip chat-hint" data-hint="nice table of today's tickets">Nice table</button>
        <button type="button" class="chat-chip chat-hint" data-hint="list tickets">Tickets</button>
        <button type="button" class="chat-chip chat-hint" data-hint="bar chart of open vs closed tickets">Ticket chart</button>
        <button type="button" class="chat-chip chat-hint" data-hint="pie chart of inventory by status">Inventory chart</button>
        <button type="button" class="chat-chip chat-hint" data-hint="create pptx of all tickets">Export PPTX</button>
      </div>` : ""}
    </div>`
      : "");
  if (!body && !chatBusy) return "";
  const thinking = chatBusy
    ? `<div class="msg-row assistant thinking-row">
        <div class="msg-avatar-col"><span class="msg-avatar" aria-hidden="true">${esc(initials)}</span></div>
        <div class="msg-stack">
          <div class="msg-meta">${esc(label)}</div>
          <div class="msg-bubble assistant thinking-bubble"><span class="think-dot"></span><span class="think-dot"></span><span class="think-dot"></span></div>
        </div>
      </div>`
    : "";
  return `<div class="live-chat${view !== "chat" ? " agent-live-chat" : ""}" id="liveChatThread" data-agent="${attr(view)}">${body}${thinking}</div>`;
}

function hydrateChatCharts() {
  const thread = document.getElementById("liveChatThread");
  if (!thread || !window.MissionCharts) return;
  window.MissionCharts.destroyChatCharts();
  const view = (currentView === "chat" || AGENT_CHAT_VIEWS.has(currentView)) ? currentView : "chat";
  const messages = getChatMessages(view);
  const chartMessages = messages.filter(m => m.role !== "user" && Array.isArray(m.charts) && m.charts.length);
  const stacks = thread.querySelectorAll(".msg-bubble.has-genui");
  chartMessages.forEach((msg, i) => {
    if (stacks[i]) window.MissionCharts.attachChartPayloads(stacks[i], msg.charts);
  });
  window.MissionCharts.mountChatCharts(thread);
}

function withAgentChat(innerHtml) {
  const chat = liveChatMarkup(currentView, { empty: false, hints: false });
  return `<div class="agent-stack">
    <div class="agent-page-body">${innerHtml}</div>
    ${chat ? `<div class="agent-chat-dock">${chat}</div>` : ""}
  </div>`;
}

function overviewView() {
  const support = demos.find(d => d.id === "support");
  const cards = demos.map(d => `<article class="agent-prompt-card" data-view="${d.id}">
    <div class="agent-card-top">
      ${agentMarkHtml(d.id, "sm")}
      <div class="agent-label">${esc(d.number)} · ${esc(d.label)}</div>
    </div>
    <h3>${esc(d.name)}</h3>
    <p class="desc">${esc(d.description)}</p>
    <div class="prompt-box">"${esc(d.example)}"</div>
  </article>`).join("");
  return `<div class="chat-thread">
    <p class="chat-system">Mission Control session · AI Glasses</p>
    <article class="computer-card glasses-hero-card">
      <div class="computer-head">
        <strong>AI Glasses</strong>
        <span class="control-badge">UAELAB AI Assistant</span>
      </div>
      <p>${esc(support?.example || "Call the Lab Expert Engineer — I need help on this MME alarm screen.")}</p>
      <div class="glasses-hero-media">
        <img src="/ai-glasses-hero.jpg" alt="UAELAB AI vision glasses" width="960" height="540" loading="lazy">
      </div>
    </article>
    <p class="chat-system">Available agents</p>
    ${cards || '<p class="muted">No agents loaded.</p>'}
    <section class="routing"><h2>Command routing</h2><div class="routing-table">${routingRows()}</div></section>
  </div>`;
}

function dashboardView() {
  return `<div class="page-head">
    <div><h1>Dashboard</h1><p>Agents executing now, and completed work across support, tests, and tickets.</p></div>
    <button class="secondary compact" id="refreshTaskBoard" type="button">Refresh board</button>
  </div>
  ${queueStatsStrip()}
  ${executingAgentsPanel()}
  <section class="connected-panel">
    <div class="connected-head"><h2>Connected agents</h2><span class="count"><strong>${connectedAgents.length}</strong> active</span></div>
    ${connectedAgentsStrip()}
  </section>
  <div class="connected-head board-section-head"><h2>Task board</h2><span class="count">In Progress · Complete</span></div>
  ${taskBoardMarkup()}`;
}

function kanbanView() {
  const active = boardCol("in_progress").count || 0;
  const done = boardCol("complete").count || 0;
  return `<div class="page-head">
    <div><h1>Kanban</h1><p>In-progress execution and completed tasks — which agent is running what.</p></div>
    <div class="log-actions">
      <span class="count"><strong>${active}</strong> executing · <strong>${done}</strong> complete</span>
      <button class="secondary compact" id="refreshTaskBoard" type="button">Refresh</button>
    </div>
  </div>
  ${queueStatsStrip()}
  ${executingAgentsPanel()}
  ${taskBoardMarkup()}`;
}

function agentsView() {
  return `<div class="page-head">
    <div class="page-head-main">
      ${agentMarkHtml("chat", "lg")}
      <div>
        <h1>Agents</h1>
        <p>All Lab AI Mission Control demo agents — each card has a unique animated OpenAI-style mark.</p>
      </div>
    </div>
    <div class="count"><strong>${demos.length}</strong> agents</div>
  </div>
  <section class="agent-grid">${demos.map(agentCard).join("") || '<p class="muted">No agents loaded.</p>'}</section>
  <section class="routing"><h2>Agent Command Routing</h2><div class="routing-table">${routingRows()}</div></section>`;
}

function inventoryView() {
  const demo = demos.find(d => d.id === "inventory");
  return withAgentChat(`${agentPageHead(demo, { actions: '<button class="primary" id="addInventory">＋ Add item</button>' })}
    <section class="demo-banner"><strong>Sample prompt:</strong> "${esc(demo?.example || "")}"</section>
    <section class="toolbar"><label class="search">⌕ <input id="inventorySearch" placeholder="Search inventory"></label><div class="count"><strong id="inventoryCount">${inventory.length}</strong> items</div></section>
    <section class="grid" id="inventoryGrid">${inventory.map(itemCard).join("") || '<p class="muted">No inventory items yet.</p>'}</section>`);
}

function itemCard(item) {
  const desc = String(item.notes || "").trim();
  const preview = item.preview_image || item.image || "";
  const hasVideo = Boolean(item.has_video || item.media_type === "video");
  const media = preview
    ? `<div class="inv-media"><img class="inv-thumb" src="${attr(preview)}" alt="${attr(item.name)}" loading="lazy">${hasVideo ? '<span class="inv-media-badge">Video</span>' : ""}</div>`
    : hasVideo
      ? `<div class="inv-media inv-media-video"><span class="inv-media-badge">Video</span></div>`
      : `<div class="avatar">${esc(item.name.slice(0, 2).toUpperCase())}</div>`;
  return `<article class="person-card inventory-card" data-id="${item.id}"><div class="person-head">${media}<div><h3>${esc(item.name)}</h3><p>${esc(item.location || "No location")}${item.category ? ` · ${esc(item.category)}` : ""}</p>${desc ? `<p class="muted inv-desc">${esc(desc)}</p>` : ""}</div></div><div class="chips"><span class="chip">${esc(item.status)}</span><span class="chip ok">Qty ${item.quantity}</span>${hasVideo || preview ? '<span class="chip">Media</span>' : ""}</div><div class="card-foot">Tap to edit →</div></article>`;
}

function knowledgeView() {
  const demo = demos.find(d => d.id === "knowledge");
  return withAgentChat(`${agentPageHead(demo)}
    <section class="knowledge-upload" id="knowledgeDropZone">
      <label class="knowledge-upload-card" for="knowledgeFile">
        <span class="knowledge-plus" aria-hidden="true">＋</span>
        <strong>Upload a document</strong>
        <small>Drop or choose a .txt / .md file — title is filled from the filename</small>
        <input type="file" id="knowledgeFile" accept=".txt,.md,.markdown,.text,text/plain,text/markdown" hidden>
      </label>
      <button type="button" class="secondary knowledge-write-btn" id="addKnowledge">Write article</button>
    </section>
    <section class="toolbar"><label class="search">⌕ <input id="knowledgeSearch" placeholder="Search procedures"></label><div class="count"><strong id="knowledgeCount">${knowledge.length}</strong> articles</div></section>
    <section class="article-list" id="knowledgeList">${knowledge.map(articleRow).join("") || '<p class="muted">No knowledge articles yet. Upload a document or write one.</p>'}</section>`);
}

function articleRow(article) {
  return `<article class="article-card" data-id="${article.id}"><div><h3>${esc(article.title)}</h3><p>${esc(article.summary || "No summary")}</p><div class="chips">${String(article.tags || "").split(",").filter(Boolean).map(tag => `<span class="chip">${esc(tag.trim())}</span>`).join("")}</div></div><button class="secondary compact view-article" data-id="${article.id}">Read</button></article>`;
}

function testsView() {
  const demo = demos.find(d => d.id === "tests");
  return withAgentChat(`${agentPageHead(demo || { id: "tests", number: "03", label: "ACT", name: "Autonomous Lab Test", description: "" }, { title: demo?.name || "Autonomous Lab Test", actions: '<button class="primary" id="startTestRun">Start 5 Mobile PS cycles</button>' })}
    <section class="demo-banner"><strong>Sample prompt:</strong> "${esc(demo?.example || "")}"</section>
    <section class="toolbar"><div class="count"><strong id="testsCount">${tests.length}</strong> recent runs</div></section>
    <section class="test-list" id="testList">${tests.map(testRow).join("") || '<p class="muted">No test runs yet.</p>'}</section>`);
}

function mobilePsView() {
  const demo = demos.find(d => d.id === "mobile-ps");
  const url = "http://localhost:5173";
  return withAgentChat(`${agentPageHead(demo, { actions: `<a class="primary" href="${url}" target="_blank" rel="noopener">Open Mobile PS Engineer ↗</a>` })}
    <section class="demo-banner"><strong>Custom app:</strong> Connect two Android phones over ADB, assign UE-A / UE-B, check readiness, then start deterministic validation cycles. Backend: FastAPI on :8100 · UI: React on :5173</section>
    <iframe class="mobile-ps-frame" title="Mobile PS Engineer" src="${url}"></iframe>`);
}

function twinCard(t) {
  const ready = String(t.status || "").toUpperCase() === "READY";
  const processed = t.processed || {};
  const hasProcessed = Boolean(processed.has_processed || t.processed_file || processed.video_url || processed.splat_url || processed.ply_url);
  const mp4Url = t.download_mp4_url || (ready ? `/api/twins/${t.twin_id}/download/mp4` : "");
  return `<article class="article-card twin-card">
    <div>
      <h3>${esc(t.twin_id)}</h3>
      <p>${esc(t.title || t.current_step || "")}</p>
      <div class="chips">
        <span class="chip ${ready ? "ok" : "warn"}">${esc(t.status || "…")}</span>
        <span class="chip">${esc(t.engine || "")}</span>
        <span class="chip">${t.frame_count != null ? `${t.frame_count} frames` : ""}</span>
        ${hasProcessed ? `<span class="chip ok">processed twin</span>` : ""}
      </div>
      ${hasProcessed ? `<p class="muted twin-processed-links">Processed:
        ${processed.video_url ? `<a href="${attr(processed.video_url)}" target="_blank" rel="noopener">MP4</a>` : ""}
        ${processed.ply_url ? `<a href="${attr(processed.ply_url)}?download=1" download>PLY</a>` : ""}
        ${processed.splat_url ? `<a href="${attr(processed.splat_url)}?download=1" download>SPLAT</a>` : ""}
        ${processed.zip_url ? `<a href="${attr(processed.zip_url)}?download=1" download>ZIP</a>` : ""}
      </p>` : ""}
    </div>
    <div class="log-actions twin-actions">
      ${ready ? `<a class="primary compact" href="${attr(t.viewer_url || `/twin-viewer.html?id=${t.twin_id}`)}" target="_blank" rel="noopener">Open capture</a>` : ""}
      ${mp4Url ? `<a class="secondary compact" href="${attr(mp4Url)}" download>Download MP4</a>` : ""}
      ${ready ? `<label class="secondary compact">Upload processed<input type="file" class="twin-processed-file" data-id="${attr(t.twin_id)}" accept=".mp4,.ply,.splat,.ksplat,.glb,.zip,video/mp4,application/zip" hidden></label>` : ""}
      ${hasProcessed && processed.video_url ? `<a class="primary compact" href="${attr(processed.video_url)}" target="_blank" rel="noopener">Show processed</a>` : ""}
      ${hasProcessed && !processed.video_url ? `<a class="primary compact" href="${attr(t.viewer_url || `/twin-viewer.html?id=${t.twin_id}`)}" target="_blank" rel="noopener">Show processed</a>` : ""}
      <button class="secondary compact twin-refresh" data-id="${attr(t.twin_id)}">Status</button>
    </div>
  </article>`;
}

function abTwinView() {
  const demo = demos.find(d => d.id === "ab-twin");
  return withAgentChat(`${agentPageHead(demo, { title: "Digital Capture", actions: '<label class="primary compact">＋ Capture / upload walk-through<input type="file" id="twinVideoFile" accept="video/mp4,video/webm,video/quicktime" hidden></label>' })}
    <section class="demo-banner"><strong>Voice / prompt:</strong> "${esc(demo?.example || "Create digital capture — record the lab walk-through and build the capture.")}"
    <br><strong>Offline Gaussian splatting:</strong> Download MP4 → rebuild with Gaussian splatting offline → <em>Upload processed</em> (PLY / SPLAT / MP4 / ZIP) → open <strong>Show processed</strong>.
    <br><strong>Upload link pattern:</strong> <code>POST /api/twins/&lt;TWIN-ID&gt;/processed</code> · download <code>/api/twins/&lt;TWIN-ID&gt;/download/mp4</code></section>
    <section class="toolbar"><div class="count"><strong id="twinsCount">${twins.length}</strong> captures</div>
      <button class="secondary compact" id="refreshTwins">Refresh</button></section>
    <section class="article-list" id="twinsList">${twins.map(twinCard).join("") || '<p class="muted">No digital captures yet. Upload a walk-through video to create one.</p>'}</section>`);
}

function isRemoteSupportTicket(ticket) {
  return (ticket.ticket_type || "") === "remote_support" || Boolean(ticket.support_call_id);
}

function filteredTickets() {
  if (ticketFilter === "remote_support") return tickets.filter(isRemoteSupportTicket);
  if (ticketFilter === "evidence") return tickets.filter(t => !isRemoteSupportTicket(t));
  return tickets;
}

function ticketsView() {
  const demo = demos.find(d => d.id === "tickets");
  const shown = filteredTickets();
  const openCount = shown.filter(t => t.status === "open").length;
  const remoteCount = tickets.filter(isRemoteSupportTicket).length;
  return withAgentChat(`${agentPageHead(demo, { actions: '<button class="primary" id="createTicket">＋ Create ticket</button>' })}
    <section class="demo-banner"><strong>Open evidence tickets stay open</strong> until you close them manually. Ending an Expert Engineer call creates a ticket here — it does not auto-close. Use <strong>Expert Engineer</strong> below to display all support tickets and read transcriptions.</section>
    <section class="toolbar ticket-filter-bar">
      <div class="ticket-filters" role="tablist">
        <button type="button" class="chip-btn${ticketFilter === "all" ? " active" : ""}" data-ticket-filter="all">All (${tickets.length})</button>
        <button type="button" class="chip-btn${ticketFilter === "remote_support" ? " active" : ""}" data-ticket-filter="remote_support">Expert Engineer (${remoteCount})</button>
        <button type="button" class="chip-btn${ticketFilter === "evidence" ? " active" : ""}" data-ticket-filter="evidence">Evidence (${tickets.length - remoteCount})</button>
      </div>
      <label class="search">⌕ <input id="ticketSearch" placeholder="Search by code, title, transcription, or description" value=""></label>
      <div class="count"><strong id="ticketsCount">${openCount}</strong> open · ${shown.length} shown</div>
    </section>
    <section class="test-list" id="ticketList">${shown.map(ticketRow).join("") || `<p class="muted">${ticketFilter === "remote_support" ? "No Expert Engineer support tickets yet. End a live call to create one with transcription." : "No evidence tickets yet. Click <strong>Create ticket</strong> to add one from the web console."}</p>`}</section>`);
}


function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load evidence frame"));
    img.src = src;
  });
}

async function framesToVideoBlobUrl(frames, fps = 8) {
  if (!frames.length) throw new Error("No video frames");
  const first = await loadImage(frames[0]);
  const canvas = document.createElement("canvas");
  canvas.width = first.naturalWidth || first.width || 1280;
  canvas.height = first.naturalHeight || first.height || 720;
  const ctx = canvas.getContext("2d");
  const stream = canvas.captureStream(fps);
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const finished = new Promise(resolve => {
    recorder.onstop = () => resolve(URL.createObjectURL(new Blob(chunks, { type: mimeType.split(";")[0] })));
  });
  recorder.start(100);
  for (const frame of frames) {
    const img = await loadImage(frame);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    await new Promise(r => setTimeout(r, 1000 / fps));
  }
  await new Promise(r => setTimeout(r, 200));
  recorder.stop();
  stream.getTracks().forEach(track => track.stop());
  return finished;
}

async function getTicketVideoUrl(ticket) {
  if (ticket.video) return ticket.video;
  const frames = ticket.video_frames || [];
  if (!frames.length) return "";
  if (ticketVideoCache.has(ticket.id)) return ticketVideoCache.get(ticket.id);
  const url = await framesToVideoBlobUrl(frames);
  ticketVideoCache.set(ticket.id, url);
  return url;
}

function ticketVideoLabel(ticket) {
  if (ticket.evidence_type !== "video") return "screenshot";
  if (ticket.video || ticket.evidence_format === "clip") return "video clip";
  return "video clip";
}

function ticketEvidenceHtml(ticket, { compact = false } = {}) {
  if (ticket.evidence_type === "screenshot" && ticket.image) {
    return `<div class="ticket-evidence ${compact ? "compact" : ""}"><img class="ticket-evidence-image" src="${attr(ticket.image)}" alt="Screenshot evidence"></div>`;
  }
  if (ticket.evidence_type === "video" && (ticket.video || ticket.video_frames?.length)) {
    if (ticket.video) {
      return `<div class="ticket-evidence ${compact ? "compact" : ""}"><video class="ticket-evidence-video" controls playsinline preload="metadata" src="${attr(ticket.video)}"></video></div>`;
    }
    return `<div class="ticket-evidence video-evidence-player ${compact ? "compact" : ""}" data-ticket-id="${ticket.id}">
      <p class="muted video-loading">Preparing video…</p>
      <video class="ticket-evidence-video" controls playsinline></video>
    </div>`;
  }
  if (ticket.preview_image) {
    return `<div class="ticket-evidence ${compact ? "compact" : ""}"><img class="ticket-evidence-image" src="${attr(ticket.preview_image)}" alt="Evidence preview"></div>`;
  }
  return `<div class="ticket-evidence empty"><p class="muted">No evidence preview available.</p></div>`;
}

function ticketRow(ticket) {
  const statusClass = ticket.status === "open" ? "chip ok" : ticket.status === "closed" ? "chip" : "chip warn";
  const code = ticket.ticket_code || ticket.ticket_number || `TKT-${ticket.id}`;
  const hasMedia = Boolean(ticket.image || ticket.video || ticket.preview_image || ticket.video_frames?.length);
  const canClose = ticket.status === "open";
  const transcript = ticketTranscriptText(ticket);
  const preview = (ticketDescriptionWithoutTranscript(ticket) || ticket.description || "").slice(0, 180);
  const isRemote = (ticket.ticket_type || "") === "remote_support" || Boolean(ticket.support_call_id);
  return `<article class="test-card ticket-card" data-id="${ticket.id}">
    <div class="ticket-card-main">
      <div><h3>${esc(code)} · ${esc(ticket.title || "Evidence ticket")}</h3><p>${esc(preview)}${preview.length >= 180 ? "…" : ""}</p>
      <div class="chips"><span class="${statusClass}">${esc(ticket.status)}</span><span class="chip">${esc(ticketVideoLabel(ticket))}</span><span class="chip">${esc(deviceBadge(ticket.device))}</span>${isRemote ? `<span class="chip">remote support</span>` : ""}${transcript ? `<span class="chip ok">transcription</span>` : ""}</div></div>
      <div class="ticket-card-actions">
        ${transcript ? `<button class="primary compact view-transcript" data-id="${ticket.id}">Read transcription</button>` : ""}
        <button class="secondary compact view-ticket" data-id="${ticket.id}">${hasMedia ? "Expand" : "Details"}</button>
        ${canClose ? `<button class="secondary compact close-ticket" data-id="${ticket.id}">Close ticket</button>` : ""}
      </div>
    </div>
    ${hasMedia ? ticketEvidenceHtml(ticket, { compact: true }) : ""}
  </article>`;
}

function testRow(run) {
  const statusClass = run.status.includes("fail") ? "chip warn" : run.status === "completed" ? "chip ok" : "chip";
  return `<article class="test-card" data-id="${run.id}"><div><h3>${esc(run.name)}</h3><p>${esc(run.test_type)} · ${run.cycles_completed}/${run.cycles_total} cycles</p><span class="${statusClass}">${esc(run.status.replaceAll("_", " "))}</span></div><button class="secondary compact view-report" data-id="${run.id}">View report</button></article>`;
}

async function loadDemos() { demos = await api("/api/demos"); }
async function loadInventory(q = "") { inventory = await api(`/api/inventory?q=${encodeURIComponent(q)}`); }
async function loadKnowledge(q = "") { knowledge = await api(`/api/knowledge?q=${encodeURIComponent(q)}`); }
async function loadTests() { tests = await api("/api/tests"); }
async function loadTaskBoard() { taskBoard = await api("/api/tasks/board"); }
async function loadTwins() { twins = await api("/api/twins"); }
async function loadTickets(q = "") {
  try {
    tickets = await api(`/api/tickets?q=${encodeURIComponent(q)}&include_media=1`);
    const missingMedia = tickets.some(t => !t.image && !t.video && !t.preview_image && !t.video_frames?.length);
    if (missingMedia && tickets.length) {
      tickets = await Promise.all(tickets.map(async ticket => {
        try {
          const detail = await api(`/api/tickets/${ticket.id}`);
          return { ...ticket, ...detail };
        } catch {
          return ticket;
        }
      }));
    }
  } catch (err) {
    tickets = [];
    if (currentView === "tickets") toast(err.message || "Could not load tickets");
  }
}

async function uploadTwinProcessedFile(twinId, file) {
  if (!twinId || !file) return;
  if (file.size > 380 * 1024 * 1024) throw new Error("Processed file too large (max ~380MB)");
  toast(`Uploading processed twin for ${twinId}…`);
  const dataUrl = await readFileAsDataUrl(file);
  const result = await api(`/api/twins/${twinId}/processed`, {
    method: "POST",
    body: JSON.stringify({
      file: dataUrl,
      filename: file.name,
      label: `Offline real digital twin · ${file.name}`,
    }),
  });
  await loadTwins();
  render();
  bindAbTwin();
  const processed = result.processed || {};
  const openUrl = processed.video_url || result.viewer_url || `/twin-viewer.html?id=${twinId}`;
  toast(result.spoken_summary || "Processed twin uploaded");
  window.open(openUrl, "_blank", "noopener");
  return result;
}

function bindAbTwin() {
  const fileInput = $("#twinVideoFile");
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > 180 * 1024 * 1024) return toast("Video too large (max ~180MB for demo upload)");
    toast("Uploading walk-through…");
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const job = await api("/api/twins", {
        method: "POST",
        body: JSON.stringify({
          title: `Lab capture · ${file.name}`,
          description: "Create digital capture from AI-glasses walk-through video",
          video: dataUrl,
          device: "ray-ban",
          lab_name: "Telecom Lab",
        }),
      });
      toast(`Capture ${job.twin_id} started`);
      await loadTwins();
      render();
      bindAbTwin();
      const poll = setInterval(async () => {
        await loadTwins();
        const current = twins.find(t => t.twin_id === job.twin_id);
        if (!current) return;
        if (["READY", "FAILED"].includes(String(current.status || "").toUpperCase())) {
          clearInterval(poll);
          render();
          bindAbTwin();
          toast(current.status === "READY" ? "Digital capture ready — download MP4 for offline real twin" : (current.error || "Capture failed"));
        } else if (currentView === "ab-twin") {
          render();
          bindAbTwin();
        }
      }, 2000);
    } catch (err) { toast(err.message); }
    finally { fileInput.value = ""; }
  });
  $("#refreshTwins")?.addEventListener("click", async () => {
    await loadTwins(); render(); bindAbTwin();
  });
  $$(".twin-refresh").forEach(btn => btn.onclick = async () => {
    try {
      const detail = await api(`/api/twins/${btn.dataset.id}`);
      toast(`${detail.twin_id}: ${detail.status} — ${detail.current_step || ""}`);
      await loadTwins(); render(); bindAbTwin();
    } catch (err) { toast(err.message); }
  });
  $$(".twin-processed-file").forEach(input => {
    input.onchange = async () => {
      const file = input.files?.[0];
      const twinId = input.dataset.id;
      if (!file || !twinId) return;
      try {
        await uploadTwinProcessedFile(twinId, file);
      } catch (err) {
        toast(err.message);
      } finally {
        input.value = "";
      }
    };
  });
}

function bindOverview() {
  $$(".agent-card, .agent-prompt-card").forEach(el => el.onclick = () => showView(el.dataset.view));
}

function bindInventory() {
  $("#addInventory").onclick = () => openInventoryDialog();
  let timer; $("#inventorySearch").oninput = e => { clearTimeout(timer); timer = setTimeout(async () => { await loadInventory(e.target.value); render(); bindInventory(); }, 180); };
  $$(".inventory-card").forEach(card => card.onclick = () => openInventoryDialog(Number(card.dataset.id)));
}

function bindKnowledge() {
  $("#addKnowledge").onclick = () => openKnowledgeDialog();
  const fileInput = $("#knowledgeFile");
  if (fileInput) {
    fileInput.onchange = async e => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        await openKnowledgeFromFile(file);
      } catch (err) { toast(err.message); }
    };
  }
  const drop = $("#knowledgeDropZone");
  if (drop) {
    drop.ondragover = e => { e.preventDefault(); drop.classList.add("dragover"); };
    drop.ondragleave = () => drop.classList.remove("dragover");
    drop.ondrop = async e => {
      e.preventDefault();
      drop.classList.remove("dragover");
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      try {
        await openKnowledgeFromFile(file);
      } catch (err) { toast(err.message); }
    };
  }
  let timer; $("#knowledgeSearch").oninput = e => { clearTimeout(timer); timer = setTimeout(async () => { await loadKnowledge(e.target.value); render(); bindKnowledge(); }, 180); };
  $$(".view-article").forEach(btn => btn.onclick = e => { e.stopPropagation(); showArticle(Number(btn.dataset.id)); });
  $$(".article-card").forEach(card => {
    card.onclick = () => showArticle(Number(card.dataset.id));
  });
}

function bindTests() {
  $("#startTestRun").onclick = async () => {
    try {
      await api("/api/tests/start", { method: "POST", body: JSON.stringify({ test_type: "Mobile PS", cycles: 5 }) });
      await loadTests(); render(); bindTests(); toast("Test run completed");
    } catch (err) { toast(err.message); }
  };
  $$(".view-report").forEach(btn => btn.onclick = async e => {
    e.stopPropagation();
    const run = await api(`/api/tests/${btn.dataset.id}/report`);
    alert(run.report);
  });
}

function bindTicketVideos(root = document) {
  root.querySelectorAll(".video-evidence-player").forEach(async panel => {
    const video = panel.querySelector("video");
    const loading = panel.querySelector(".video-loading");
    if (!video || video.dataset.ready === "1") return;
    const ticket = tickets.find(row => row.id === Number(panel.dataset.ticketId));
    if (!ticket) return;
    try {
      const url = await getTicketVideoUrl(ticket);
      if (!url) throw new Error("No video");
      video.src = url;
      video.dataset.ready = "1";
      loading?.remove();
    } catch {
      if (loading) loading.textContent = "Could not prepare video playback.";
    }
  });
}

function bindTickets() {
  $("#createTicket").onclick = () => openTicketDialog();
  $$("[data-ticket-filter]").forEach(btn => {
    btn.onclick = () => {
      ticketFilter = btn.dataset.ticketFilter || "all";
      render();
      bindTickets();
    };
  });
  let timer;
  const search = $("#ticketSearch");
  if (search) {
    search.oninput = e => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await loadTickets(e.target.value);
        render();
        bindTickets();
        const input = $("#ticketSearch");
        if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
      }, 180);
    };
  }
  bindTicketVideos();
  $$(".view-ticket").forEach(btn => btn.onclick = e => { e.stopPropagation(); showTicket(Number(btn.dataset.id)); });
  $$(".view-transcript").forEach(btn => btn.onclick = e => { e.stopPropagation(); showTicketTranscript(Number(btn.dataset.id)); });
  $$(".close-ticket").forEach(btn => btn.onclick = async e => {
    e.stopPropagation();
    const id = Number(btn.dataset.id);
    if (!confirm("Close this evidence ticket? (Expert Engineer call is already separate — this only closes the ticket.)")) return;
    try {
      await api(`/api/tickets/${id}`, { method: "PATCH", body: JSON.stringify({ status: "closed" }) });
      await loadTickets($("#ticketSearch")?.value || "");
      await loadTaskBoard();
      render();
      bindTickets();
      toast("Evidence ticket closed");
    } catch (err) {
      toast(err.message);
    }
  });
}

function ticketFormHtml() {
  return `<form class="ticket-form" id="ticketForm">
    <label>Evidence description
      <textarea id="ticketDescription" required placeholder="What does the evidence show? e.g. Red SCTP timeout banner on MME console"></textarea>
    </label>
    <label>Ticket title <span class="muted">(optional)</span>
      <input id="ticketTitle" placeholder="Short title for the ticket">
    </label>
    <label>Evidence type
      <select id="ticketEvidenceType">
        <option value="screenshot">Screenshot</option>
        <option value="video">Video clip</option>
      </select>
    </label>
    <label id="ticketFileLabel">Upload evidence
      <input type="file" id="ticketFiles" accept="image/png,image/jpeg,image/webp">
    </label>
    <div class="ticket-preview hidden" id="ticketPreviewWrap"><img id="ticketPreview" class="ticket-evidence-image" alt="Evidence preview"><video id="ticketVideoPreview" class="ticket-evidence-video hidden" controls playsinline></video></div>
    <div class="modal-actions">
      <button type="button" class="secondary" data-close-modal>Cancel</button>
      <button type="submit" class="primary" id="ticketSubmit">Create ticket</button>
    </div>
  </form>`;
}

function openTicketDialog() {
  openModal("Create evidence ticket", ticketFormHtml(), () => {
    const form = $("#ticketForm");
    const typeSelect = $("#ticketEvidenceType");
    const fileInput = $("#ticketFiles");
    const previewWrap = $("#ticketPreviewWrap");
    const preview = $("#ticketPreview");
    const videoPreview = $("#ticketVideoPreview");

    const syncFileInput = () => {
      const isVideo = typeSelect.value === "video";
      fileInput.multiple = false;
      fileInput.accept = isVideo ? "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" : "image/png,image/jpeg,image/webp";
      $("#ticketFileLabel").firstChild.textContent = isVideo ? "Upload video clip " : "Upload screenshot ";
    };
    typeSelect.onchange = () => {
      fileInput.value = "";
      previewWrap.classList.add("hidden");
      preview.classList.add("hidden");
      videoPreview.classList.add("hidden");
      syncFileInput();
    };
    syncFileInput();

    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      previewWrap.classList.remove("hidden");
      if (typeSelect.value === "video") {
        preview.classList.add("hidden");
        videoPreview.classList.remove("hidden");
        videoPreview.src = URL.createObjectURL(file);
        return;
      }
      videoPreview.classList.add("hidden");
      preview.classList.remove("hidden");
      preview.src = await readFileAsDataUrl(file);
    };

    form.onsubmit = async e => {
      e.preventDefault();
      const description = $("#ticketDescription").value.trim();
      const evidenceType = typeSelect.value;
      const title = $("#ticketTitle").value.trim();
      const file = fileInput.files?.[0];
      if (!description) return toast("Add an evidence description");
      if (!file) return toast(evidenceType === "screenshot" ? "Upload a screenshot" : "Upload a video clip");

      const submit = $("#ticketSubmit");
      submit.disabled = true;
      submit.textContent = "Creating…";
      try {
        const body = { description, evidence_type: evidenceType };
        if (title) body.title = title;
        if (evidenceType === "screenshot") {
          body.image = await readFileAsDataUrl(file);
        } else {
          body.video = await readFileAsDataUrl(file);
        }
        const created = await api("/api/tickets", { method: "POST", body: JSON.stringify(body) });
        closeModal();
        await loadTickets($("#ticketSearch")?.value || "");
        render();
        bindTickets();
        toast(`Ticket ${created.ticket_code || "created"}`);
      } catch (err) {
        toast(err.message);
      } finally {
        submit.disabled = false;
        submit.textContent = "Create ticket";
      }
    };
  });
}

function ticketTranscriptText(ticket) {
  const direct = String(ticket?.transcript || "").trim();
  if (direct) return direct;
  const desc = String(ticket?.description || "");
  for (const marker of ["## Call transcription\n", "Transcript:\n"]) {
    const idx = desc.indexOf(marker);
    if (idx >= 0) return desc.slice(idx + marker.length).trim();
  }
  return "";
}

function ticketDescriptionWithoutTranscript(ticket) {
  const desc = String(ticket?.description || "");
  for (const marker of ["\n## Call transcription\n", "\nTranscript:\n", "## Call transcription\n", "Transcript:\n"]) {
    const idx = desc.indexOf(marker);
    if (idx >= 0) return desc.slice(0, idx).trim();
  }
  return desc.trim();
}

function formatTranscriptForReading(raw) {
  return String(raw || "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (!match) return line;
      const sender = match[1].toLowerCase();
      const label = sender === "expert" ? "Expert"
        : sender === "field" ? "Field"
        : sender === "system" ? "System"
        : match[1];
      return `${label}: ${match[2]}`;
    })
    .join("\n");
}

async function showTicketTranscript(id) {
  try {
    const ticket = await api(`/api/tickets/${id}`);
    const code = ticket.ticket_code || ticket.ticket_number || `TKT-${ticket.id}`;
    const transcript = ticketTranscriptText(ticket);
    if (!transcript) {
      toast("No transcription saved on this ticket yet");
      return;
    }
    openModal(`${code} · Call transcription`, `
      <p class="muted">Expert Engineer session transcription stored with this remote support ticket.</p>
      <pre class="ticket-transcript ticket-transcript-full">${esc(formatTranscriptForReading(transcript))}</pre>
      <div class="modal-actions">
        <button type="button" class="secondary" id="openTicketFromTranscript">Open full ticket</button>
        <button type="button" class="primary" data-close-modal>Close</button>
      </div>
    `, () => {
      $("#openTicketFromTranscript")?.addEventListener("click", () => {
        closeModal();
        showTicket(ticket.id);
      });
    });
  } catch (err) {
    toast(err.message);
  }
}

async function showTicket(id) {
  try {
    const ticket = await api(`/api/tickets/${id}`);
    const code = ticket.ticket_code || ticket.ticket_number || `TKT-${ticket.id}`;
    const transcript = ticketTranscriptText(ticket);
    const description = ticketDescriptionWithoutTranscript(ticket) || "Remote support evidence ticket";
    openModal(`${code} · ${ticket.title || "Evidence ticket"}`, `
      <div class="ticket-detail-meta">
        <div><strong>Status</strong> ${esc(ticket.status)} · ${esc(ticketVideoLabel(ticket))}</div>
        <div><strong>Device</strong> ${esc(deviceBadge(ticket.device))}</div>
        <div><strong>Description</strong> ${esc(description)}</div>
      </div>
      ${transcript ? `<div class="ticket-transcript-block">
        <div class="ticket-transcript-head"><strong>Call transcription</strong><button type="button" class="secondary compact" id="expandTranscript">Open readable view</button></div>
        <pre class="ticket-transcript">${esc(formatTranscriptForReading(transcript))}</pre>
      </div>` : `<p class="muted">No call transcription stored on this ticket.</p>`}
      ${ticketEvidenceHtml(ticket)}
      <div class="modal-actions">
        ${transcript ? `<button type="button" class="secondary" id="modalReadTranscript">Read transcription</button>` : ""}
        ${ticket.status === "open" ? `<button type="button" class="primary" id="modalCloseTicket">Close ticket</button>` : ""}
        <button type="button" class="secondary" data-close-modal>Dismiss</button>
      </div>
    `, () => {
      bindTicketVideos($("#modalBody"));
      const openReadable = () => showTicketTranscript(ticket.id);
      $("#expandTranscript")?.addEventListener("click", openReadable);
      $("#modalReadTranscript")?.addEventListener("click", openReadable);
      $("#modalCloseTicket")?.addEventListener("click", async () => {
        try {
          await api(`/api/tickets/${ticket.id}`, { method: "PATCH", body: JSON.stringify({ status: "closed" }) });
          closeModal();
          await loadTickets($("#ticketSearch")?.value || "");
          await loadTaskBoard();
          render();
          bindTickets();
          toast("Evidence ticket closed");
        } catch (err) {
          toast(err.message);
        }
      });
    });
  } catch (err) {
    toast(err.message);
  }
}

function supportViewerUrl(roomCode) {
  const signal = platformConfig.webrtc_signal_url || "wss://visionclaw-signaling.fly.dev";
  const base = platformConfig.webrtc_viewer_url || "/support-viewer.html";
  if (base.startsWith("http")) {
    const url = new URL(base);
    url.searchParams.set("room", roomCode);
    url.searchParams.set("autojoin", "1");
    url.searchParams.set("signal", signal);
    url.searchParams.set("v", "5");
    return url.toString();
  }
  return `${base}?room=${encodeURIComponent(roomCode)}&autojoin=1&signal=${encodeURIComponent(signal)}&v=5`;
}

function supportCallCard(call) {
  const active = call.id === activeSupportId ? " active" : "";
  const ringing = call.id === ringingCallId ? " ringing" : "";
  const phase = call.call_phase || call.status;
  const ended = call.status === "ended" || phase === "ended";
  const ticketId = call.ticket_id || call.ticket?.id || "";
  return `<article class="support-call-card${active}${ringing}${ended ? " ended" : ""}" data-id="${call.id}">
    <div><strong>${esc(call.call_code)}</strong> · ${esc(phase)}</div>
    <p class="muted">${esc(call.description || "Expert engineer request")}</p>
    <div class="chips"><span class="chip">${esc(deviceBadge(call.device))}</span>${phase === "waiting" ? `<span class="chip warn">Incoming</span>` : `<span class="chip ok">${esc(phase)}</span>`}${call.expert_label ? `<span class="chip">${esc(call.expert_label)}</span>` : ""}${call.ticket_code ? `<span class="chip">${esc(call.ticket_code)}</span>` : ""}</div>
    ${!ended
      ? `<button class="primary compact accept-support" data-id="${call.id}">${phase === "live" ? "Open session" : "Answer call"}</button>`
      : `<div class="support-ended-actions">
          ${ticketId ? `<button class="primary compact open-support-transcript" data-ticket-id="${attr(ticketId)}">Read transcription</button>
          <button class="secondary compact open-support-ticket" data-ticket-id="${attr(ticketId)}">Open ticket</button>` : `<span class="muted">No ticket saved</span>`}
        </div>`}
  </article>`;
}

function supportTicketRow(call) {
  const ticketId = call.ticket_id || call.ticket?.id || "";
  const ticketCode = call.ticket_code || "pending";
  return `<article class="test-card ticket-card support-ticket-row" data-call-id="${call.id}">
    <div class="ticket-card-main">
      <div>
        <h3>${esc(call.call_code)} · ${esc(ticketCode)}</h3>
        <p>${esc(call.description || "Expert Engineer support ticket")}</p>
        <div class="chips">
          <span class="chip">ended</span>
          <span class="chip">${esc(deviceBadge(call.device))}</span>
          ${ticketCode !== "pending" ? `<span class="chip ok">transcription</span>` : ""}
        </div>
      </div>
      <div class="ticket-card-actions">
        ${ticketId ? `<button class="primary compact open-support-transcript" data-ticket-id="${attr(ticketId)}">Read transcription</button>
        <button class="secondary compact open-support-ticket" data-ticket-id="${attr(ticketId)}">Open ticket</button>` : `<span class="muted">No ticket</span>`}
      </div>
    </div>
  </article>`;
}

function supportChatBubble(msg) {
  const sender = String(msg.sender || "system").toLowerCase();
  return `<article class="chat-bubble ${esc(sender)}"><div class="chat-meta">${esc(msg.sender)} · ${esc(formatLogTime(msg.created_at))}</div>${esc(msg.message)}</article>`;
}

function supportVideoStatus(call) {
  const room = call?.room_code || liveRoomCode;
  const phase = call?.call_phase || call?.status || "live";
  if (phase === "waiting") return { label: "ringing", cls: "warn" };
  if (!room) return { label: "waiting for glasses video", cls: "warn" };
  return { label: phase === "live" ? "live · joining video" : phase, cls: "ok" };
}

function supportLivePanel(call, messages = []) {
  const room = call.room_code || liveRoomCode;
  const viewerUrl = room ? supportViewerUrl(room) : "";
  const status = supportVideoStatus(call);
  return `<section class="support-live support-call-immersive" id="supportLivePanel">
    <div class="call-stage" id="supportCallStage">
      <div class="call-stage-top">
        <div class="call-stage-identity">
          <span class="call-live-dot" aria-hidden="true"></span>
          <div>
            <strong class="call-stage-title">${esc(call.call_code || "Session")} · Lab Expert Engineer</strong>
            <p class="call-stage-sub">${esc(call.description || "Live glasses video call")}</p>
          </div>
        </div>
        <div class="call-stage-badges">
          <span class="chip ${status.cls} call-status-chip">${esc(status.label)}</span>
          ${room ? `<span class="call-room-chip">Room ${esc(room)}</span>` : ""}
        </div>
      </div>
      <div class="call-stage-video">
        ${viewerUrl
          ? `<iframe class="support-video-frame" id="supportVideoFrame" title="Lab Expert Engineer video" allow="camera; microphone; autoplay; fullscreen" allowfullscreen src="${attr(viewerUrl)}" data-room="${attr(room)}" data-call-id="${attr(call.id)}"></iframe>`
          : `<div class="support-video-placeholder call-waiting-stage" id="supportVideoPlaceholder">
              <div class="call-waiting-pulse" aria-hidden="true"></div>
              <p><strong>Connecting video…</strong></p>
              <p class="muted">Call answered. Waiting for glasses to open the video room.</p>
              <p class="muted">Keep the stream / Video session active on the phone or glasses.</p>
            </div>`}
        <div class="call-stage-vignette" aria-hidden="true"></div>
      </div>
      <div class="call-stage-bar">
        <button type="button" class="call-ctrl secondary compact" id="expandSupportCall" title="Immersive fullscreen">Fullscreen</button>
        <button type="button" class="call-ctrl secondary compact" id="refreshSupport">Refresh</button>
        ${viewerUrl ? `<a class="call-ctrl secondary compact" href="${attr(viewerUrl)}" target="_blank" rel="noopener">Pop out</a>` : ""}
        <button type="button" class="call-ctrl primary compact call-end" id="endSupportCall">End call</button>
      </div>
    </div>
    <aside class="call-side">
      <h3>Call chat</h3>
      <div class="support-chat" id="supportChat">${messages.map(supportChatBubble).join("") || '<p class="muted">No messages yet.</p>'}</div>
      <form class="support-chat-input" id="supportChatForm">
        <input id="supportChatInput" placeholder="Message the field engineer…" autocomplete="off">
        <button class="primary compact" type="submit">Send</button>
      </form>
      <p class="muted call-side-note">Ending the call creates an open evidence ticket with transcription.</p>
    </aside>
  </section>`;
}

function supportView() {
  const demo = demos.find(d => d.id === "support");
  // Prefer a live call over a stale ended selection.
  if (activeSupportId) {
    const selected = supportCalls.find(c => c.id === activeSupportId);
    if (!selected || selected.status === "ended" || selected.call_phase === "ended") {
      const live = supportCalls.find(c => c.status !== "ended" && c.call_phase !== "ended");
      activeSupportId = live ? live.id : null;
      if (!live) { liveRoomCode = ""; liveViewerMounted = false; }
    }
  }
  const active = supportCalls.find(c => c.id === activeSupportId) || null;
  const liveCalls = supportCalls.filter(c => c.status !== "ended" && c.call_phase !== "ended");
  const endedCalls = supportCalls.filter(c => c.status === "ended" || c.call_phase === "ended");
  const ticketsToShow = supportShowAllTickets ? endedCalls : endedCalls.slice(0, 5);
  return withAgentChat(`${agentPageHead(demo, { actions: '<button class="secondary" id="refreshSupportQueue">Refresh queue</button>' })}
    <section class="demo-banner" id="supportTopAnchor"><strong>How it works:</strong> Live call = In Progress. When the call ends, a support ticket is saved with the <em>call transcription</em>. Click <strong>Display all</strong> below to open and read every Expert Engineer ticket.</section>
    <section class="support-layout${active ? " support-layout-live" : ""}">
      ${active ? supportLivePanel(active, active.messages || []) : `<section class="support-live" id="supportLivePanel"><p class="muted">Waiting for an incoming Lab Expert Engineer request…</p></section>`}
      <section class="support-queue${active ? " support-queue-collapsed" : ""}">
        <h2>Incoming requests</h2>
        <div class="support-queue-list" id="supportQueue">${liveCalls.map(supportCallCard).join("") || '<p class="muted">No live Expert Engineer requests. Start a call from the glasses app or say “Lab Expert Engineer”.</p>'}</div>
      </section>
    </section>
    <section class="support-tickets-panel">
      <div class="connected-head">
        <h2>Expert Engineer support tickets</h2>
        <span class="count"><strong>${endedCalls.length}</strong> ended</span>
      </div>
      <div class="toolbar support-tickets-toolbar">
        <button type="button" class="primary compact" id="displayAllSupportTickets">${supportShowAllTickets ? "Show recent" : "Display all"}</button>
        <button type="button" class="secondary compact" id="openRemoteTicketsFilter">Open in Evidence Tickets</button>
      </div>
      <section class="test-list" id="supportTicketList">
        ${ticketsToShow.map(supportTicketRow).join("") || '<p class="muted">No ended Expert Engineer tickets yet. End a live call to create one with transcription.</p>'}
      </section>
    </section>`);
}

async function loadPlatformConfig() {
  try { platformConfig = await api("/api/config"); } catch { platformConfig = { webrtc_viewer_url: "/support-viewer.html", webrtc_signal_url: "wss://visionclaw-signaling.fly.dev" }; }
}

async function loadSupportCalls() {
  supportCalls = await api("/api/support/sessions?phase=all");
}

async function loadActiveSupportDetail() {
  if (!activeSupportId) return;
  const detail = await api(`/api/support/sessions/${activeSupportId}?include_messages=1`);
  supportCalls = supportCalls.map(call => call.id === detail.id ? detail : call);
}

function stopSupportPoll() {
  if (supportPollTimer) { clearInterval(supportPollTimer); supportPollTimer = null; }
}

function syncSupportLiveHeader(active) {
  const panel = $("#supportLivePanel");
  if (!panel || !active) return;
  const title = panel.querySelector(".call-stage-title") || panel.querySelector(".connected-head h2");
  const chip = panel.querySelector(".call-status-chip") || panel.querySelector(".connected-head .chip");
  const sub = panel.querySelector(".call-stage-sub");
  if (title) title.textContent = `${active.call_code || "Session"} · Lab Expert Engineer`;
  if (sub && active.description) sub.textContent = active.description;
  if (chip) {
    const status = supportVideoStatus(active);
    chip.className = `chip ${status.cls} call-status-chip`;
    chip.textContent = status.label;
  }
}

function clearSupportViewer() {
  const frame = $("#supportVideoFrame");
  if (frame) {
    try { frame.src = "about:blank"; } catch {}
    frame.removeAttribute("data-room");
  }
  liveRoomCode = "";
  liveViewerMounted = false;
}

function bindSupportTicketActions() {
  $$(".open-support-transcript").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const id = Number(btn.dataset.ticketId);
      if (id) showTicketTranscript(id);
    };
  });
  $$(".open-support-ticket").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const id = Number(btn.dataset.ticketId);
      if (id) showTicket(id);
    };
  });
}

function updateSupportSoft() {
  const liveCalls = supportCalls.filter(c => c.status !== "ended" && c.call_phase !== "ended");
  const endedCalls = supportCalls.filter(c => c.status === "ended" || c.call_phase === "ended");
  const queue = $("#supportQueue");
  if (queue) {
    queue.innerHTML = liveCalls.map(supportCallCard).join("")
      || '<p class="muted">No live Expert Engineer requests. Start a call from the glasses app or say “Expert Engineer Agent”.</p>';
  }
  const ticketList = $("#supportTicketList");
  if (ticketList) {
    const ticketsToShow = supportShowAllTickets ? endedCalls : endedCalls.slice(0, 5);
    ticketList.innerHTML = ticketsToShow.map(supportTicketRow).join("")
      || '<p class="muted">No ended Expert Engineer tickets yet. End a live call to create one with transcription.</p>';
  }
  const displayBtn = $("#displayAllSupportTickets");
  if (displayBtn) displayBtn.textContent = supportShowAllTickets ? "Show recent" : "Display all";
  $$(".accept-support").forEach(btn => btn.onclick = () => acceptSupportCall(Number(btn.dataset.id)));
  bindSupportTicketActions();

  // Drop ended/stale selected sessions so we never keep reconnecting an old room.
  let active = supportCalls.find(c => c.id === activeSupportId);
  if (active && (active.status === "ended" || active.call_phase === "ended")) {
    const newer = supportCalls.find(c => c.status !== "ended" && c.call_phase !== "ended");
    if (newer) {
      activeSupportId = newer.id;
      active = newer;
      clearSupportViewer();
      render();
      bindSupport();
      toast(`Switched to live call ${newer.call_code}`);
      return;
    }
    activeSupportId = null;
    clearSupportViewer();
    render();
    bindSupport();
    return;
  }

  // If nothing selected but a live call exists, keep queue clickable; do not auto-bind dead rooms.
  if (!active) {
    return;
  }

  syncSupportLiveHeader(active);
  const room = active.room_code || "";
  const frame = $("#supportVideoFrame");
  const chat = $("#supportChat");
  if (active.messages && chat) {
    chat.innerHTML = active.messages.map(supportChatBubble).join("") || '<p class="muted">No messages yet.</p>';
    chat.scrollTop = chat.scrollHeight;
  }

  if (!room) {
    if (frame) clearSupportViewer();
    const headChip = $("#supportLivePanel .call-status-chip") || $("#supportLivePanel .connected-head .chip");
    if (headChip && (active.call_phase === "live" || active.call_phase === "accepted" || active.call_phase === "waiting")) {
      headChip.className = "chip warn call-status-chip";
      headChip.textContent = "waiting for glasses video";
    }
    return;
  }

  liveRoomCode = room;
  const url = supportViewerUrl(room);
  if (!frame) {
    liveViewerMounted = false;
    render();
    bindSupport();
    return;
  }

  // Always keep iframe on the active call room (force reload when call id or room changes).
  const frameCall = frame.dataset.callId || "";
  const needRemount = frame.dataset.room !== room || frameCall !== String(active.id);
  if (needRemount) {
    frame.dataset.room = room;
    frame.dataset.callId = String(active.id);
    frame.src = url;
    liveViewerMounted = true;
    const hint = $("#supportVideoHint");
    if (hint) hint.innerHTML = `Video room <strong>${esc(room)}</strong> · call ${esc(active.call_code || active.id)} · <a href="${attr(url)}" target="_blank" rel="noopener">Open in new tab</a>`;
  } else {
    liveViewerMounted = true;
  }
  syncSupportLiveHeader(active);
}

function ensureAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

function beepRingTone() {
  try {
    const ctx = ensureAudioCtx();
    const now = ctx.currentTime;
    [0, 0.22].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = offset ? 880 : 740;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    });
  } catch {}
}

function startIncomingRing(call) {
  ringingCallId = call.id;
  const panel = $("#incomingCall");
  const title = $("#incomingCallTitle");
  const desc = $("#incomingCallDesc");
  if (title) title.textContent = `${call.call_code || "Call"} · Lab Expert Engineer`;
  if (desc) desc.textContent = call.description || "New request from AI glasses";
  panel?.classList.remove("hidden");
  stopIncomingRingAudio();
  beepRingTone();
  ringTimer = setInterval(beepRingTone, 1600);
  // Jump to Expert Engineer page top so the live call is visible without scrolling up.
  if (currentView !== "support") {
    showView("support").catch(() => {}).finally(() => scrollMainToTop({ smooth: false }));
  } else {
    scrollMainToTop({ smooth: false });
  }
}

function stopIncomingRingAudio() {
  if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
}

function hideIncomingCall() {
  stopIncomingRingAudio();
  ringingCallId = null;
  $("#incomingCall")?.classList.add("hidden");
}

function detectIncomingSupportCalls(calls) {
  const waiting = (calls || []).filter(c => c.status !== "ended" && (c.call_phase === "waiting" || !c.call_phase));
  if (!supportIdsSeeded) {
    (calls || []).forEach(c => knownSupportIds.add(c.id));
    supportIdsSeeded = true;
    return;
  }
  for (const call of waiting) {
    if (!knownSupportIds.has(call.id)) {
      knownSupportIds.add(call.id);
      startIncomingRing(call);
      toast(`Incoming Expert Engineer call ${call.call_code || call.id}`);
      break;
    }
  }
  if (ringingCallId && !waiting.some(c => c.id === ringingCallId)) hideIncomingCall();
}

async function pollIncomingSupport() {
  try {
    const calls = await api("/api/support/sessions?phase=all");
    supportCalls = calls;
    detectIncomingSupportCalls(calls);
    if (currentView === "support") updateSupportSoft();
  } catch {}
}

function startIncomingSupportMonitor() {
  if (incomingPollTimer) return;
  pollIncomingSupport();
  incomingPollTimer = setInterval(pollIncomingSupport, 2000);
}

function startSupportPoll() {
  stopSupportPoll();
  supportPollTimer = setInterval(async () => {
    if (currentView !== "support") return;
    try {
      await loadSupportCalls();
      if (activeSupportId) await loadActiveSupportDetail();
      updateSupportSoft();
    } catch {}
  }, 2500);
}

async function acceptSupportCall(id) {
  const call = supportCalls.find(row => row.id === id) || { id };
  hideIncomingCall();
  try {
    await api(`/api/support/sessions/${id}/accept`, {
      method: "POST",
      body: JSON.stringify({ expert_label: "Expert engineer" }),
    });
  } catch (err) {
    toast(err.message);
  }
  activeSupportId = id;
  liveRoomCode = call.room_code || "";
  liveViewerMounted = false;
  clearSupportViewer();
  if (currentView !== "support") showView("support");
  await loadSupportCalls();
  await loadActiveSupportDetail();
  const fresh = supportCalls.find(row => row.id === id);
  if (fresh?.room_code) liveRoomCode = fresh.room_code;
  // Always rebuild the live panel so title/iframe match this call (never keep an old room).
  render();
  bindSupport();
  scrollMainToTop({ smooth: false });
  // User gesture (Answer) unlocks remote audio inside the support viewer iframe.
  setTimeout(() => {
    try {
      $("#supportVideoFrame")?.contentWindow?.postMessage({ type: "lab-enable-remote-av" }, "*");
    } catch {}
  }, 800);
  setTimeout(() => {
    try {
      $("#supportVideoFrame")?.contentWindow?.postMessage({ type: "lab-enable-remote-av" }, "*");
    } catch {}
  }, 2500);
  if (fresh?.room_code) toast(`Call answered — joining glasses room ${fresh.room_code}…`);
  else toast("Call answered — waiting for glasses video room…");
}

async function answerIncomingCall() {
  if (!ringingCallId) return;
  await acceptSupportCall(ringingCallId);
}

async function sendSupportMessage(text, sender = "expert") {
  if (!activeSupportId || !text.trim()) return;
  await api(`/api/support/sessions/${activeSupportId}/messages`, {
    method: "POST",
    body: JSON.stringify({ sender, message: text.trim() }),
  });
  await loadActiveSupportDetail();
  updateSupportSoft();
}

async function handleSupportTranscriptLine(data) {
  if (!activeSupportId) return;
  const text = String(data?.text || "").trim();
  if (!text) return;
  const sender = String(data?.sender || "expert").trim() || "expert";
  try {
    await sendSupportMessage(text, sender);
  } catch (err) {
    console.warn("support transcript post failed", err);
  }
}

window.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "lab-transcript-line") {
    handleSupportTranscriptLine(data).catch(() => {});
  }
});

async function collectSupportEvidenceFrames(timeoutMs = 2500) {
  const frame = $("#supportVideoFrame");
  if (!frame?.contentWindow) return [];
  const requestId = `ev-${Date.now()}`;
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve([]);
    }, timeoutMs);
    function onMessage(event) {
      const data = event.data || {};
      if (data.type !== "lab-evidence-frames" || data.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(Array.isArray(data.frames) ? data.frames.filter(Boolean).slice(0, 40) : []);
    }
    window.addEventListener("message", onMessage);
    try {
      frame.contentWindow.postMessage({ type: "lab-get-evidence-frames", requestId }, "*");
    } catch {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve([]);
    }
  });
}

async function endSupportCall() {
  let openedTicketId = null;
  let openedHasTranscript = false;
  if (activeSupportId) {
    if (!confirm("End this Expert Engineer call? The live session will close. An evidence ticket will be created and left OPEN for you to close manually.")) return;
    toast("Ending call & saving evidence ticket…");
    await loadActiveSupportDetail().catch(() => {});
    const active = supportCalls.find(c => c.id === activeSupportId);
    const liveTranscript = (active?.messages || [])
      .map(m => `[${String(m.sender || "system").trim()}] ${String(m.message || "").trim()}`)
      .filter(line => line.length > 3)
      .join("\n");
    const frames = await collectSupportEvidenceFrames();
    const body = {
      support_call_id: activeSupportId,
      evidence_type: "video",
      allow_empty_evidence: true,
    };
    if (frames.length) body.video_frames = frames;
    if (liveTranscript) body.transcript = liveTranscript;
    const result = await api("/api/support/end", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const code = result.ticket_code || result.ticket?.ticket_code || "saved";
    openedTicketId = result.ticket_id || result.ticket?.id || null;
    openedHasTranscript = Boolean(result.transcript || result.ticket?.transcript || liveTranscript);
    toast(openedHasTranscript
      ? `Call closed. Ticket ${code} saved with transcription.`
      : frames.length
        ? `Call closed. Evidence ticket ${code} is open (${frames.length} frames).`
        : `Call closed. Evidence ticket ${code} is open.`);
  }
  try {
    $("#supportVideoFrame")?.contentWindow?.postMessage({ type: "lab-end-viewer" }, "*");
  } catch {}
  activeSupportId = null;
  liveRoomCode = "";
  liveViewerMounted = false;
  clearSupportViewer();
  hideIncomingCall();
  await loadSupportCalls();
  await loadTickets();
  await loadTaskBoard();
  render();
  bindSupport();
  if (openedTicketId) {
    if (openedHasTranscript) showTicketTranscript(openedTicketId);
    else showTicket(openedTicketId);
  }
}

function bindSupport() {
  $("#refreshSupportQueue")?.addEventListener("click", async () => { await loadSupportCalls(); if (activeSupportId) await loadActiveSupportDetail(); updateSupportSoft(); toast("Queue refreshed"); });
  $$(".accept-support").forEach(btn => btn.onclick = () => acceptSupportCall(Number(btn.dataset.id)));
  $("#displayAllSupportTickets")?.addEventListener("click", () => {
    supportShowAllTickets = !supportShowAllTickets;
    render();
    bindSupport();
  });
  $("#openRemoteTicketsFilter")?.addEventListener("click", () => {
    ticketFilter = "remote_support";
    showView("tickets");
  });
  bindSupportTicketActions();
  $("#supportChatForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const input = $("#supportChatInput");
    const text = input?.value || "";
    input.value = "";
    await sendSupportMessage(text);
  });
  $("#refreshSupport")?.addEventListener("click", async () => { await loadActiveSupportDetail(); updateSupportSoft(); });
  $("#endSupportCall")?.addEventListener("click", () => endSupportCall().catch(err => toast(err.message)));
  $("#expandSupportCall")?.addEventListener("click", () => {
    const stage = $("#supportCallStage") || $("#supportLivePanel");
    if (!stage) return;
    if (!document.fullscreenElement) stage.requestFullscreen?.().catch(() => toast("Fullscreen not available"));
    else document.exitFullscreen?.().catch(() => {});
  });
  const frame = $("#supportVideoFrame");
  if (frame && liveRoomCode) frame.dataset.room = liveRoomCode;
  const chat = $("#supportChat");
  if (chat) chat.scrollTop = chat.scrollHeight;
}

function bindIncomingCallUi() {
  $("#answerIncomingCall")?.addEventListener("click", () => answerIncomingCall().catch(err => toast(err.message)));
  $("#dismissIncomingCall")?.addEventListener("click", hideIncomingCall);
  document.body.addEventListener("pointerdown", () => { try { ensureAudioCtx(); } catch {} }, { once: true });
}

function bindNav() {
  renderSidebar();
  $("#sessionSearch")?.addEventListener("input", e => {
    sessionQuery = e.target.value || "";
    renderSidebar();
  });
  $("#openLogs")?.addEventListener("click", () => showView("logs"));
  $("#openEvidence")?.addEventListener("click", () => showView("tickets"));
  $("#composerForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const input = $("#composerInput");
    const text = (input?.value || "").trim();
    if (!text || chatBusy) return;
    if (input) input.value = "";
    sendMissionChat(text).catch(err => toast(err.message));
  });
}

function scrollChatToEnd() {
  const run = () => {
    const thread = document.getElementById("liveChatThread");
    const dock = thread?.closest(".agent-chat-dock");
    if (thread) thread.scrollTop = thread.scrollHeight;
    if (dock) dock.scrollTop = dock.scrollHeight;
    const last = thread?.querySelector(".msg-row:last-child");
    if (last) last.scrollIntoView({ block: "end", behavior: "smooth" });
  };
  requestAnimationFrame(() => {
    run();
    requestAnimationFrame(run);
    setTimeout(run, 60);
  });
}

/** Always land at the top of the main pane (latest tickets / live call), not mid-scroll. */
function scrollMainToTop({ smooth = false } = {}) {
  const behavior = smooth ? "smooth" : "auto";
  const workspace = document.querySelector(".chat-workspace");
  const main = $("#main");
  const topTargets = [workspace, main, document.scrollingElement, document.documentElement, document.body].filter(Boolean);
  for (const el of topTargets) {
    try {
      el.scrollTop = 0;
      if (typeof el.scrollTo === "function") el.scrollTo({ top: 0, left: 0, behavior });
    } catch {
      try { el.scrollTop = 0; } catch {}
    }
  }
  try { window.scrollTo({ top: 0, left: 0, behavior }); } catch { try { window.scrollTo(0, 0); } catch {} }
  const anchor = $("#supportTopAnchor")
    || document.querySelector(".page-head")
    || document.querySelector(".support-live")
    || document.querySelector(".chat-thread")
    || document.querySelector(".agent-page-body")
    || main;
  try { anchor?.scrollIntoView?.({ block: "start", behavior }); } catch {}
}

function bindChat() {
  $$(".chat-hint").forEach(btn => {
    btn.onclick = () => sendMissionChat(btn.dataset.hint || btn.textContent).catch(err => toast(err.message));
  });
  scrollChatToEnd();
}

async function sendMissionChat(text) {
  const message = String(text || "").trim();
  if (!message || chatBusy) return;
  const stayOnAgent = AGENT_CHAT_VIEWS.has(currentView) && currentView !== "chat"
    ? currentView
    : (AGENT_CHAT_VIEWS.has(currentView) ? currentView : null);

  // From dashboard/overview/etc → Lab Manager chat. From a specialist agent → stay there.
  if (!stayOnAgent && currentView !== "chat") currentView = "chat";
  const threadView = stayOnAgent || "chat";
  const messages = getChatMessages(threadView);
  chatBusy = true;
  messages.push({ role: "user", content: message });
  render();
  scrollChatToEnd();
  try {
    const history = messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .slice(0, -1)
      .slice(-12)
      .map(m => ({ role: m.role, content: m.content }));
    const result = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message,
        history,
        view: threadView === "chat" ? "chat" : threadView,
        agent: threadView === "chat" ? null : threadView,
      }),
    });
    messages.push({
      role: "assistant",
      content: result.reply || "No reply",
      source: result.source || "assistant",
      agent_name: result.agent_name || assistantChatLabel(threadView),
      download_url: result.download_url
        || (String(result.reply || "").match(/\/api\/reports\/[\w.%+-]+\.pptx/i) || [])[0]
        || "",
      excel_url: result.excel_url
        || (String(result.reply || "").match(/\/api\/reports\/[\w.%+-]+\.csv/i) || [])[0]
        || "",
      charts: Array.isArray(result.charts) ? result.charts : [],
      tables: Array.isArray(result.tables) ? result.tables : [],
      analytics: result.analytics || null,
    });
    if (result.routed && result.agent && result.agent !== "chat" && result.agent !== threadView) {
      toast(`Routed to ${result.agent_name || result.agent}`);
    }
    if (result.tables?.length) toast("Smart table ready in chat");
    else if (result.charts?.length) toast("Analysis charts ready in chat");
    // Reports and Q&A stay in this chat. Only navigate on an explicit open/show command.
    const explicitOpen = /^(open|show|go to|launch|switch to)\b/i.test(message)
      || (result.source === "local" && /^Opening\b/i.test(String(result.reply || "")));
    if (explicitOpen && result.action?.view && result.action.view !== currentView) {
      toast(`Opening ${result.action.view}…`);
      setTimeout(() => showView(result.action.view), 400);
    }
  } catch (err) {
    messages.push({
      role: "assistant",
      content: `Chat failed: ${err.message}`,
      source: "error",
      agent_name: assistantChatLabel(threadView),
    });
  } finally {
    chatBusy = false;
    render();
    scrollChatToEnd();
    requestAnimationFrame(() => hydrateChatCharts());
  }
}

function bindTaskBoard() {
  $("#refreshTaskBoard")?.addEventListener("click", async () => {
    try {
      await loadTaskBoard();
      await loadAgentStatus().catch(() => {});
      render();
      toast("Board refreshed");
    } catch (err) { toast(err.message); }
  });
  $$(".task-card[data-view]").forEach(card => {
    const view = card.dataset.view;
    if (!view) return;
    card.onclick = () => showView(view);
  });
}

function render() {
  if (currentView !== "logs") stopLogStream();
  if (currentView !== "support") stopSupportPoll();
  const views = {
    chat: chatView,
    overview: overviewView,
    dashboard: dashboardView,
    kanban: kanbanView,
    agents: agentsView,
    inventory: inventoryView,
    knowledge: knowledgeView,
    tests: testsView,
    "mobile-ps": mobilePsView,
    "ab-twin": abTwinView,
    logs: logsView,
    tickets: ticketsView,
    support: supportView,
  };
  $("#main").innerHTML = (views[currentView] || chatView)();
  updateChatHeader();
  renderSidebar();
  if (currentView === "chat" || AGENT_CHAT_VIEWS.has(currentView)) {
    bindChat();
    requestAnimationFrame(() => hydrateChatCharts());
  }
  if (currentView === "overview" || currentView === "agents") bindOverview();
  if (currentView === "dashboard" || currentView === "kanban") bindTaskBoard();
  if (currentView === "inventory") bindInventory();
  if (currentView === "knowledge") bindKnowledge();
  if (currentView === "tests") bindTests();
  if (currentView === "logs") bindLogs();
  if (currentView === "tickets") bindTickets();
  if (currentView === "ab-twin") bindAbTwin();
  if (currentView === "support") { bindSupport(); startSupportPoll(); }
  requestAnimationFrame(() => scrollMainToTop({ smooth: false }));
}

async function showView(view) {
  if (currentView === "logs" && view !== "logs") stopLogStream();
  if (currentView === "support" && view !== "support") stopSupportPoll();
  currentView = view;
  syncWebAgentPresence().catch(() => {});
  if (view === "dashboard" || view === "kanban" || view === "agents") {
    await loadAgentStatus().catch(() => {});
  }
  if (view === "dashboard" || view === "kanban") {
    await loadTaskBoard().catch(err => toast(err.message));
  }
  if (view === "inventory") await loadInventory($("#inventorySearch")?.value || "");
  if (view === "knowledge") await loadKnowledge($("#knowledgeSearch")?.value || "");
  if (view === "tests") await loadTests();
  if (view === "logs") { await loadLogs(true); await loadAgentStatus(); }
  if (view === "tickets") {
    await loadTickets("");
    render();
    return;
  }
  if (view === "ab-twin") {
    await loadTwins().catch(err => toast(err.message));
    render();
    return;
  }
  if (view === "support") {
    await loadPlatformConfig();
    await loadSupportCalls();
    render();
    scrollMainToTop({ smooth: false });
    return;
  }
  render();
  scrollMainToTop({ smooth: false });
}

async function openInventoryDialog(id) {
  const item = id
    ? await api(`/api/inventory/${id}`)
    : { name: "", category: "", location: "", quantity: 1, status: "Available", notes: "", image: "", video: "", media_type: "" };
  const isEdit = Boolean(id);
  const existingType = item.media_type || (item.video ? "video" : item.image ? "image" : "");
  const hasExistingMedia = Boolean(item.image || item.video);
  openModal(isEdit ? "Edit inventory item" : "Add inventory item", `
    <form class="ticket-form inventory-form" id="inventoryForm">
      <label>Item name
        <input id="invName" required placeholder="e.g. RF shield box" value="${attr(item.name || "")}">
      </label>
      <label>Description
        <textarea id="invNotes" rows="3" required placeholder="What this item is / what it is used for">${esc(item.notes || "")}</textarea>
      </label>
      <label>Location
        <input id="invLocation" required placeholder="e.g. Bench A · Rack 3 · Shelf 2" value="${attr(item.location || "")}">
      </label>
      <label>Category <span class="muted">(optional)</span>
        <input id="invCategory" placeholder="e.g. RF, handset, tool" value="${attr(item.category || "")}">
      </label>
      <div class="inventory-form-row">
        <label>Quantity
          <input id="invQuantity" type="number" min="0" step="1" required value="${attr(String(item.quantity ?? 1))}">
        </label>
        <label>Status
          <select id="invStatus">
            ${["Available", "In use", "Reserved", "Maintenance", "Missing"].map(s =>
              `<option value="${attr(s)}"${String(item.status || "Available") === s ? " selected" : ""}>${esc(s)}</option>`
            ).join("")}
            ${!["Available", "In use", "Reserved", "Maintenance", "Missing"].includes(String(item.status || ""))
              ? `<option value="${attr(item.status)}" selected>${esc(item.status)}</option>` : ""}
          </select>
        </label>
      </div>
      <label>Media type <span class="muted">(optional)</span>
        <select id="invMediaType">
          <option value=""${!existingType ? " selected" : ""}>None</option>
          <option value="image"${existingType === "image" ? " selected" : ""}>Photo</option>
          <option value="video"${existingType === "video" ? " selected" : ""}>Video</option>
        </select>
      </label>
      <label id="invFileLabel" class="${existingType ? "" : "hidden"}">Upload photo or video
        <input type="file" id="invFile" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov">
      </label>
      <div class="ticket-preview ${hasExistingMedia || item.image || item.video ? "" : "hidden"}" id="invPreviewWrap">
        <img id="invPreview" class="ticket-evidence-image ${item.image && existingType !== "video" ? "" : "hidden"}" src="${attr(item.image || "")}" alt="Item photo">
        <video id="invVideoPreview" class="ticket-evidence-video ${item.video ? "" : "hidden"}" controls playsinline src="${attr(item.video || "")}"></video>
      </div>
      ${hasExistingMedia ? `<label class="inv-clear-media"><input type="checkbox" id="invClearMedia"> Remove current media</label>` : ""}
      <div class="modal-actions">
        <button type="button" class="secondary" data-close-modal>Cancel</button>
        <button type="submit" class="primary" id="inventorySubmit">${isEdit ? "Save changes" : "Add item"}</button>
      </div>
    </form>
  `, () => {
    const typeSelect = $("#invMediaType");
    const fileInput = $("#invFile");
    const fileLabel = $("#invFileLabel");
    const previewWrap = $("#invPreviewWrap");
    const preview = $("#invPreview");
    const videoPreview = $("#invVideoPreview");
    const clearBox = $("#invClearMedia");

    const syncFileInput = () => {
      const mediaType = typeSelect.value;
      if (!mediaType) {
        fileLabel.classList.add("hidden");
        return;
      }
      fileLabel.classList.remove("hidden");
      fileInput.accept = mediaType === "video"
        ? "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
        : "image/png,image/jpeg,image/webp";
      fileLabel.firstChild.textContent = mediaType === "video" ? "Upload video " : "Upload photo ";
    };
    typeSelect.onchange = () => {
      fileInput.value = "";
      if (clearBox) clearBox.checked = false;
      if (!typeSelect.value) {
        previewWrap.classList.add("hidden");
        preview.classList.add("hidden");
        videoPreview.classList.add("hidden");
      }
      syncFileInput();
    };
    syncFileInput();

    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (clearBox) clearBox.checked = false;
      previewWrap.classList.remove("hidden");
      if (typeSelect.value === "video" || file.type.startsWith("video/")) {
        if (!typeSelect.value) typeSelect.value = "video";
        syncFileInput();
        preview.classList.add("hidden");
        videoPreview.classList.remove("hidden");
        videoPreview.src = URL.createObjectURL(file);
        return;
      }
      if (!typeSelect.value) typeSelect.value = "image";
      syncFileInput();
      videoPreview.classList.add("hidden");
      preview.classList.remove("hidden");
      preview.src = await readFileAsDataUrl(file);
    };

    $("#inventoryForm").onsubmit = async e => {
      e.preventDefault();
      const name = $("#invName")?.value?.trim();
      const category = $("#invCategory")?.value?.trim() || "";
      const location = $("#invLocation")?.value?.trim() || "";
      const quantity = Number($("#invQuantity")?.value);
      const status = $("#invStatus")?.value?.trim() || "Available";
      const notes = $("#invNotes")?.value?.trim() || "";
      const mediaType = typeSelect?.value || "";
      const file = fileInput?.files?.[0];
      const clearMedia = Boolean(clearBox?.checked);
      if (!name) return toast("Item name is required");
      if (!notes) return toast("Item description is required");
      if (!location) return toast("Item location is required");
      if (!Number.isFinite(quantity) || quantity < 0) return toast("Quantity must be 0 or more");
      if (mediaType && !file && !hasExistingMedia) {
        return toast(mediaType === "video" ? "Upload a video" : "Upload a photo");
      }
      if (mediaType && !file && hasExistingMedia && existingType !== mediaType && !clearMedia) {
        return toast(`Upload a new ${mediaType === "video" ? "video" : "photo"} or keep the current media type`);
      }
      const btn = $("#inventorySubmit");
      if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
      try {
        const body = { name, category, location, quantity, status, notes, description: notes };
        if (clearMedia) {
          body.clear_media = true;
          body.media_type = "";
          body.image = "";
          body.video = "";
        } else if (file) {
          const dataUrl = await readFileAsDataUrl(file);
          const kind = mediaType || (file.type.startsWith("video/") ? "video" : "image");
          body.media_type = kind;
          if (kind === "video") {
            body.video = dataUrl;
            body.image = "";
          } else {
            body.image = dataUrl;
            body.video = "";
          }
        }
        await api(id ? `/api/inventory/${id}` : "/api/inventory", {
          method: id ? "PUT" : "POST",
          body: JSON.stringify(body),
        });
        closeModal();
        await loadInventory($("#inventorySearch")?.value || "");
        render();
        bindInventory();
        toast(isEdit ? "Item updated" : "Item added");
      } catch (err) {
        toast(err.message);
        if (btn) { btn.disabled = false; btn.textContent = isEdit ? "Save changes" : "Add item"; }
      }
    };
  });
}

async function openKnowledgeDialog(seed = {}) {
  const title0 = seed.title || "";
  const summary0 = seed.summary || "";
  const content0 = seed.content || "";
  const tags0 = seed.tags || "";
  openModal(seed.fromFile ? "Upload document" : "New knowledge article", `
    <form class="ticket-form knowledge-form" id="knowledgeForm">
      <label class="knowledge-file-row">
        <span>Document file <span class="muted">(optional)</span></span>
        <div class="knowledge-file-actions">
          <label class="primary compact knowledge-file-pick">＋ Choose file
            <input type="file" id="knowledgeFormFile" accept=".txt,.md,.markdown,.text,text/plain,text/markdown" hidden>
          </label>
          <small class="muted" id="knowledgeFileName">${seed.fileName ? esc(seed.fileName) : "No file selected"}</small>
        </div>
      </label>
      <label>Title
        <input id="knowledgeTitle" required placeholder="e.g. Packet Core Upgrade validation" value="${attr(title0)}">
      </label>
      <label>Short summary <span class="muted">(optional)</span>
        <input id="knowledgeSummary" placeholder="One-line description for search and spoken answers" value="${attr(summary0)}">
      </label>
      <label>Content
        <textarea id="knowledgeContent" required placeholder="Paste procedure steps, notes, or uploaded document text…" rows="10">${esc(content0)}</textarea>
      </label>
      <label>Tags <span class="muted">(comma-separated, optional)</span>
        <input id="knowledgeTags" placeholder="packet core, upgrade, validation" value="${attr(tags0)}">
      </label>
      <div class="modal-actions">
        <button type="button" class="secondary" data-close-modal>Cancel</button>
        <button type="submit" class="primary" id="knowledgeSubmit">Save article</button>
      </div>
    </form>
  `, () => {
    const formFile = $("#knowledgeFormFile");
    if (formFile) {
      formFile.onchange = async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const parsed = await readKnowledgeTextFile(file);
          const titleEl = $("#knowledgeTitle");
          const contentEl = $("#knowledgeContent");
          const summaryEl = $("#knowledgeSummary");
          const nameEl = $("#knowledgeFileName");
          if (titleEl && (!titleEl.value || seed.fromFile)) titleEl.value = parsed.title;
          if (contentEl) contentEl.value = parsed.content;
          if (summaryEl && !summaryEl.value) summaryEl.value = parsed.summary;
          if (nameEl) nameEl.textContent = file.name;
        } catch (err) { toast(err.message); }
      };
    }
    $("#knowledgeForm").onsubmit = async e => {
      e.preventDefault();
      const title = $("#knowledgeTitle")?.value?.trim();
      const summary = $("#knowledgeSummary")?.value?.trim() || "";
      const content = $("#knowledgeContent")?.value?.trim() || "";
      const tags = $("#knowledgeTags")?.value?.trim() || "";
      if (!title) return toast("Title is required");
      if (!content) return toast("Content is required");
      const btn = $("#knowledgeSubmit");
      if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
      try {
        await api("/api/knowledge", { method: "POST", body: JSON.stringify({ title, summary, content, tags }) });
        closeModal();
        await loadKnowledge($("#knowledgeSearch")?.value || "");
        render();
        bindKnowledge();
        toast("Article saved");
      } catch (err) {
        toast(err.message);
        if (btn) { btn.disabled = false; btn.textContent = "Save article"; }
      }
    };
  });
}

async function readKnowledgeTextFile(file) {
  const name = String(file.name || "document");
  const lower = name.toLowerCase();
  if (!/\.(txt|md|markdown|text)$/i.test(lower) && !String(file.type || "").startsWith("text/")) {
    throw new Error("Use a text document (.txt or .md). PDF upload can be added later.");
  }
  if (file.size > 2_000_000) throw new Error("File is too large (max 2 MB)");
  const content = await file.text();
  if (!String(content).trim()) throw new Error("File is empty");
  const title = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Untitled document";
  const firstLine = String(content).split(/\r?\n/).map(l => l.trim()).find(Boolean) || "";
  const summary = firstLine.slice(0, 160);
  return { title, summary, content: String(content), fileName: name };
}

async function openKnowledgeFromFile(file) {
  const parsed = await readKnowledgeTextFile(file);
  openKnowledgeDialog({
    title: parsed.title,
    summary: parsed.summary,
    content: parsed.content,
    fileName: parsed.fileName,
    fromFile: true,
  });
}

async function showArticle(id) {
  try {
    const article = await api(`/api/knowledge/${id}`);
    openModal(article.title || "Article", `
      <div class="knowledge-article-view">
        ${article.summary ? `<p class="knowledge-article-summary">${esc(article.summary)}</p>` : ""}
        ${article.tags ? `<div class="chips">${String(article.tags).split(",").filter(Boolean).map(t => `<span class="chip">${esc(t.trim())}</span>`).join("")}</div>` : ""}
        <pre class="knowledge-article-body">${esc(article.content || "")}</pre>
      </div>
      <div class="modal-actions"><button type="button" class="secondary" data-close-modal>Close</button></div>
    `);
  } catch (err) { toast(err.message); }
}

async function boot() {
  bindNav();
  bindIncomingCallUi();
  try { await loadDemos(); } catch (err) { toast(err.message); }
  await Promise.allSettled([loadPlatformConfig(), loadInventory(), loadKnowledge(), loadTests(), loadTickets(), loadAgentStatus(), loadTaskBoard(), loadTwins(), loadSupportCalls()]);
  detectIncomingSupportCalls(supportCalls);
  startIncomingSupportMonitor();
  startWebAgentPresence();
  startAgentStatusPoll();
  render();
}

let webAgentSessionId = null;
let webPresenceTimer = null;
let agentStatusTimer = null;
const WEB_SESSION_KEY = "lab-web-session-id";

function currentPageMeta() {
  const meta = VIEW_META[currentView] || {};
  const demo = demos.find(d => d.id === currentView);
  const title = demo?.name || meta.title || currentView || "Mission Control";
  return {
    page: title,
    agent_name: title,
    label: `Web console · ${title}`,
    location: window.location.hostname || "browser",
  };
}

function webPresenceBody(extra = {}) {
  const meta = currentPageMeta();
  return {
    device: "web",
    session_id: webAgentSessionId || sessionStorage.getItem(WEB_SESSION_KEY) || undefined,
    label: meta.label,
    agent_name: meta.agent_name,
    page: meta.page,
    location: meta.location,
    ...extra,
  };
}

async function syncWebAgentPresence() {
  if (!webAgentSessionId) return;
  try {
    await api("/api/agents/heartbeat", {
      method: "POST",
      body: JSON.stringify(webPresenceBody()),
    });
  } catch {
    webAgentSessionId = null;
    await startWebAgentPresence();
  }
}

async function startWebAgentPresence() {
  try {
    const saved = sessionStorage.getItem(WEB_SESSION_KEY);
    if (saved) webAgentSessionId = saved;
    const data = await api("/api/agents/connect", {
      method: "POST",
      body: JSON.stringify(webPresenceBody({ session_id: webAgentSessionId || undefined })),
    });
    webAgentSessionId = data.session_id;
    sessionStorage.setItem(WEB_SESSION_KEY, webAgentSessionId);
  } catch {}
  if (webPresenceTimer) clearInterval(webPresenceTimer);
  webPresenceTimer = setInterval(async () => {
    if (!webAgentSessionId) return startWebAgentPresence();
    try {
      await api("/api/agents/heartbeat", {
        method: "POST",
        body: JSON.stringify(webPresenceBody()),
      });
    } catch {
      webAgentSessionId = null;
      startWebAgentPresence();
    }
  }, 25000);
}

function stopWebAgentPresence() {
  if (webPresenceTimer) {
    clearInterval(webPresenceTimer);
    webPresenceTimer = null;
  }
  const sid = webAgentSessionId || sessionStorage.getItem(WEB_SESSION_KEY);
  if (!sid) return;
  const body = JSON.stringify({ session_id: sid });
  try {
    navigator.sendBeacon?.("/api/agents/disconnect", new Blob([body], { type: "application/json" }));
  } catch {}
  fetch("/api/agents/disconnect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
  webAgentSessionId = null;
  sessionStorage.removeItem(WEB_SESSION_KEY);
}

function startAgentStatusPoll() {
  if (agentStatusTimer) return;
  agentStatusTimer = setInterval(async () => {
    try {
      await loadAgentStatus();
      if (currentView === "dashboard" || currentView === "kanban" || currentView === "logs") {
        const was = currentView;
        if (was === "logs") updateLogsSidebar();
        else {
          await loadTaskBoard().catch(() => {});
          render();
        }
      } else {
        const el = document.querySelector(".agent-status-label");
        if (el) el.textContent = connectedAgents.length ? `${connectedAgents.length} agent(s) connected` : "Waiting for agent connection";
      }
    } catch {}
  }, 5000);
}

window.addEventListener("pagehide", stopWebAgentPresence);
window.addEventListener("beforeunload", stopWebAgentPresence);

boot().catch(err => toast(err.message));
