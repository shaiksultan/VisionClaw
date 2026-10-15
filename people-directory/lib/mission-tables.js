/**
 * Query-scoped smart tables for Mission Control chat (generative UI cards).
 */

function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function looksLikeWord(word, target, maxDist = 3) {
  if (!word || !target) return false;
  if (Math.abs(word.length - target.length) > maxDist) return false;
  return editDistance(word, target) <= maxDist;
}

function mentionsInventory(lower) {
  if (/\b(inventory|stock|equipment|gear|spares?)\b/.test(lower)) return true;
  const words = String(lower || "").match(/[a-z]{5,14}/g) || [];
  return words.some((w) => looksLikeWord(w, "inventory", 3));
}

function wantsSmartTable(text) {
  const lower = String(text || "").toLowerCase().trim();
  if (!lower) return false;
  if (!/\b(table|tabular|grid|spreadsheet view)\b/.test(lower)) return false;
  // "nice/smart/pretty table" or "show/list/create table of …"
  const styled = /\b(nice|smart|pretty|rich|formatted|beautiful|clean|proper|html)\b/.test(lower);
  const action = /\b(show|list|display|create|make|give|build|render|draw)\b/.test(lower);
  const domain = /\b(ticket|tickets|support|inventory|evidence|call|calls|expert engineer)\b/.test(lower)
    || mentionsInventory(lower);
  return styled || action || domain || /^(nice\s+)?table[.!?]?$/.test(lower);
}

function inferTableTopic(message, history = []) {
  const lower = String(message || "").toLowerCase();
  if (mentionsInventory(lower) || /\b(stock|equipment)\b/.test(lower)) return "inventory";
  if (/\b(support|expert engineer|call|calls|sup-)\b/.test(lower)) return "support";
  if (/\b(ticket|tickets|evidence|tkt-)\b/.test(lower)) return "tickets";
  // Fall back to recent user messages
  for (const m of [...(history || [])].reverse()) {
    if (m?.role !== "user") continue;
    const h = String(m.content || "").toLowerCase();
    if (mentionsInventory(h) || /\b(stock)\b/.test(h)) return "inventory";
    if (/\b(support|expert engineer|call)\b/.test(h)) return "support";
    if (/\b(ticket|tickets|evidence)\b/.test(h)) return "tickets";
  }
  return "tickets";
}

function wantTodayOnly(text, history = []) {
  if (/\btoday'?s?\b/i.test(String(text || ""))) return true;
  for (const m of [...(history || [])].reverse().slice(0, 6)) {
    if (m?.role !== "user") continue;
    if (/\btoday'?s?\b/i.test(String(m.content || ""))) return true;
  }
  return false;
}

function wantOpenOnly(text, history = []) {
  const lower = String(text || "").toLowerCase();
  if (/\bopen\b/.test(lower) && !/\b(all|closed|every)\b/.test(lower)) return true;
  for (const m of [...(history || [])].reverse().slice(0, 6)) {
    if (m?.role !== "user") continue;
    const h = String(m.content || "").toLowerCase();
    if (/\bopen\b/.test(h) && !/\b(all|closed|every)\b/.test(h) && /\bticket/.test(h)) return true;
  }
  return false;
}

function buildTicketsTable(db, message, history = []) {
  const today = wantTodayOnly(message, history);
  const openOnly = wantOpenOnly(message, history);
  let sql = `
    SELECT ticket_code, title, status, evidence_type, ticket_type, created_at
    FROM tickets
  `;
  const where = [];
  if (today) where.push("date(created_at)=date('now','localtime')");
  if (openOnly) where.push("lower(status)='open'");
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  sql += " ORDER BY id DESC LIMIT 40";
  const rows = db.prepare(sql).all();
  return {
    id: "tickets-table",
    title: today ? "Today’s tickets" : openOnly ? "Open tickets" : "Tickets",
    description: `${rows.length} row${rows.length === 1 ? "" : "s"} from Mission Control`,
    columns: ["#", "Ticket ID", "Description", "Status", "Evidence", "Type"],
    rows: rows.map((r, i) => [
      String(i + 1),
      r.ticket_code || "—",
      String(r.title || "").slice(0, 72) || "—",
      String(r.status || "—"),
      r.evidence_type === "video" ? "Video" : "Screenshot",
      r.ticket_type === "remote_support" ? "Remote support" : "Evidence",
    ]),
  };
}

function buildSupportTable(db, message, history = []) {
  const today = wantTodayOnly(message, history);
  let sql = `
    SELECT c.call_code, c.description, c.status, c.call_phase, c.device, c.started_at, t.ticket_code
    FROM support_calls c
    LEFT JOIN tickets t ON t.id = c.ticket_id
  `;
  if (today) sql += " WHERE date(c.started_at)=date('now','localtime')";
  sql += " ORDER BY c.id DESC LIMIT 40";
  const rows = db.prepare(sql).all();
  return {
    id: "support-table",
    title: today ? "Today’s Expert Engineer calls" : "Expert Engineer calls",
    description: `${rows.length} session${rows.length === 1 ? "" : "s"}`,
    columns: ["#", "Call", "Phase", "Ticket", "Device", "Started"],
    rows: rows.map((r, i) => [
      String(i + 1),
      r.call_code || "—",
      r.call_phase || r.status || "—",
      r.ticket_code || "—",
      r.device || "—",
      String(r.started_at || "—").slice(0, 19),
    ]),
  };
}

function buildInventoryTable(db) {
  const rows = db.prepare(`
    SELECT name, category, location, quantity, status
    FROM inventory
    ORDER BY name COLLATE NOCASE
    LIMIT 60
  `).all();
  return {
    id: "inventory-table",
    title: "Lab inventory",
    description: `${rows.length} item${rows.length === 1 ? "" : "s"}`,
    columns: ["#", "Name", "Category", "Location", "Qty", "Status"],
    rows: rows.map((r, i) => [
      String(i + 1),
      r.name || "—",
      r.category || "—",
      r.location || "—",
      String(r.quantity ?? "—"),
      r.status || "—",
    ]),
  };
}

function handleSmartTableChat(db, message, history = []) {
  if (!wantsSmartTable(message)) return null;
  const topic = inferTableTopic(message, history);
  let table;
  if (topic === "inventory") table = buildInventoryTable(db);
  else if (topic === "support") table = buildSupportTable(db, message, history);
  else table = buildTicketsTable(db, message, history);

  if (!table.rows.length) {
    return {
      reply: `I can show a smart table for ${topic}, but there’s no data yet.`,
      source: "local-table",
      tables: [],
      agent: "chat",
      agent_name: "Mission Control (Lab Manager)",
      action: null,
    };
  }

  return {
    reply: `Here’s a smart ${topic} table (${table.rows.length} rows) — rendered as a component, not plain text.`,
    source: "local-table",
    tables: [table],
    agent: "chat",
    agent_name: "Mission Control (Lab Manager)",
    action: null,
  };
}

module.exports = {
  wantsSmartTable,
  inferTableTopic,
  handleSmartTableChat,
};
