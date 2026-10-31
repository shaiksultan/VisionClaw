/**
 * Mission Control analytics — query-scoped generative charts + optional PPTX/Excel.
 * Only runs on explicit chart/analysis asks; charts match the user's topic.
 */

const fs = require("node:fs");
const path = require("node:path");
const PptxGenJS = require("pptxgenjs");

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
  if (words.some((w) => looksLikeWord(w, "inventory", 3))) return true;
  // "how many items" without ticket/support usually means lab inventory
  if (/\b(how many|count|total|number of)\b/.test(lower)
    && /\bitems?\b/.test(lower)
    && !/\b(ticket|tickets|support|call|calls|evidence)\b/.test(lower)) {
    return true;
  }
  return false;
}

function mentionsTickets(lower) {
  if (/\b(ticket|tickets|evidence|tkt-|remote_support)\b/.test(lower)) return true;
  const words = String(lower || "").match(/[a-z]{5,12}/g) || [];
  return words.some((w) => looksLikeWord(w, "ticket", 2) || looksLikeWord(w, "tickets", 2));
}

function wantsFullLabReport(text) {
  const lower = String(text || "").toLowerCase();
  return /\b(full report|complete report|overall report|lab report)\b/.test(lower)
    || /\ball(?:\s+the)?\s+agents?\b/.test(lower)
    || /\bevery(?:\s+the)?\s+agents?\b/.test(lower)
    || /\b(mission\s*control|lab\s*overview|overall|everything|whole lab)\b/.test(lower);
}

function wantsAnalytics(text) {
  const lower = String(text || "").toLowerCase().trim();
  if (!lower) return false;

  // Hard exclude normal Q&A / navigation / tickets pptx wording without chart intent.
  if (/^(open|show|go to|list|where is|find|lookup)\b/.test(lower) && !/\b(chart|graph|analy|report)\b/.test(lower)) {
    return false;
  }

  const visualIntent = /\b(chart|charts|graph|graphs|bar\s*chart|pie\s*chart|doughnut|line\s*chart|plot|plots|visuali[sz]e|visualization|dashboard)\b/.test(lower);
  const analysisIntent = /\b(analy[sz]e|analysis|analytics)\b/.test(lower)
    && (/\b(ticket|tickets|support|inventory|expert engineer|mission\s*control|evidence|call|calls|stock|lab|agents?)\b/.test(lower)
      || mentionsInventory(lower) || mentionsTickets(lower) || wantsFullLabReport(lower));
  const reportIntent = /\b(full report|complete report|share\s+(me\s+)?(a\s+)?(full\s+)?report)\b/.test(lower)
    && (mentionsTickets(lower) || mentionsInventory(lower) || wantsFullLabReport(lower) || /\b(support|agents?|lab)\b/.test(lower));
  const exportAnalytics = /\b(export|download|prepare|generate|create|make|share)\b/.test(lower)
    && /\b(analysis|analytics|chart|charts|graph|graphs|report)\b/.test(lower)
    && /\b(pptx|powerpoint|excel|xlsx|csv|spreadsheet|report|slides?)\b/.test(lower);
  const showBreakdown = /\b(show|give|draw|build|make|create)\b/.test(lower)
    && /\b(chart|charts|graph|graphs|breakdown)\b/.test(lower);

  return visualIntent || analysisIntent || reportIntent || exportAnalytics || showBreakdown;
}

function inferTopics(text) {
  const lower = String(text || "").toLowerCase();
  const topics = new Set();
  if (mentionsTickets(lower)) topics.add("tickets");
  if (/\b(support|expert engineer|live call|sup-|remote support|call phase|calls)\b/.test(lower)) topics.add("support");
  if (mentionsInventory(lower)) topics.add("inventory");
  if (/\b(twin|twins|digital capture|ab-twin|walk-?through)\b/.test(lower)) topics.add("twins");
  if (wantsFullLabReport(lower)) {
    topics.add("tickets");
    topics.add("support");
    topics.add("inventory");
  }
  // Explicit chart/analysis with no domain → default tickets only when nothing else matched.
  if (!topics.size && /\b(analy[sz]e|analysis|analytics|chart|charts|graph|graphs|dashboard|report)\b/.test(lower)) {
    if (/\b(mission\s*control|overview|summary|kpi|ops)\b/.test(lower)) {
      topics.add("tickets");
      topics.add("support");
      topics.add("inventory");
    } else {
      topics.add("tickets");
    }
  }
  return [...topics];
}

function wantsTodayScope(text) {
  return /\b(today|todays|to-?day)\b/i.test(String(text || ""));
}

function preferChartType(text, fallback = "bar") {
  const lower = String(text || "").toLowerCase();
  // Explicit shape wins (e.g. "daily … bar chart" must stay bar, not line).
  if (/\bpie\b/.test(lower)) return "pie";
  if (/\bdoughnut\b/.test(lower)) return "doughnut";
  if (/\b(bar|column)\b/.test(lower)) return "bar";
  if (/\b(line|trend|over time|timeline)\b/.test(lower)) return "line";
  return fallback;
}

function isAffirmation(text) {
  return /^(yes|yep|yeah|y|ok|okay|sure|confirm(ed)?|do it|show( it| me| that)?|please|go ahead|display( it)?|proceed)\.?$/i
    .test(String(text || "").trim());
}

function looksLikeChartBrief(text) {
  const lower = String(text || "").toLowerCase();
  if (wantsAnalytics(lower)) return true;
  return /\b(bar|pie|doughnut|line)\b/.test(lower)
    && /\b(ticket|tickets|inventory|support|daily|14\s*days|last\s+\d+\s+days)\b/.test(lower);
}

/** Resolve chart intent from short "yes/ok" using recent chat history. */
function resolveAnalyticsMessage(message, history = []) {
  if (wantsAnalytics(message) || looksLikeChartBrief(message)) return String(message || "");
  if (!isAffirmation(message)) return null;
  for (const m of [...(history || [])].reverse().slice(0, 12)) {
    const content = String(m?.content || "");
    if (!content.trim()) continue;
    if (looksLikeChartBrief(content)) return content;
  }
  return null;
}

function lastNDayCounts(db, days = 14) {
  const byDay = rowsOrEmpty(db, `
    SELECT substr(created_at, 1, 10) AS label, COUNT(*) AS value
    FROM tickets
    WHERE created_at IS NOT NULL AND created_at != ''
    GROUP BY substr(created_at, 1, 10)
  `);
  const map = new Map(byDay.map((r) => [r.label, r.value]));
  const out = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
    out.push({ label: key, value: Number(map.get(key) || 0) });
  }
  return out;
}

function safeCount(db, sql, params = []) {
  try {
    return Number(db.prepare(sql).get(...params)?.c || 0);
  } catch {
    return 0;
  }
}

function rowsOrEmpty(db, sql) {
  try {
    return db.prepare(sql).all().map(r => ({
      label: String(r.label || "unknown"),
      value: Number(r.value) || 0,
    }));
  } catch {
    return [];
  }
}

function collectScopedAnalytics(db, message) {
  const topics = inferTopics(message);
  const preferred = preferChartType(message);
  const todayOnly = wantsTodayScope(message);
  const fullReport = wantsFullLabReport(message);
  const charts = [];
  const tables = {};
  const ticketDayFilter = todayOnly ? " AND date(created_at)=date('now','localtime')" : "";
  const supportDayFilter = todayOnly ? " AND date(started_at)=date('now','localtime')" : "";

  const summary = {
    topics,
    today_only: todayOnly,
    tickets_total: safeCount(db, `SELECT COUNT(*) AS c FROM tickets WHERE 1=1${ticketDayFilter}`),
    tickets_open: safeCount(db, `SELECT COUNT(*) AS c FROM tickets WHERE lower(status)='open'${ticketDayFilter}`),
    tickets_closed: safeCount(db, `SELECT COUNT(*) AS c FROM tickets WHERE lower(status)='closed'${ticketDayFilter}`),
    support_total: safeCount(db, `SELECT COUNT(*) AS c FROM support_calls WHERE 1=1${supportDayFilter}`),
    support_active: safeCount(db, `
      SELECT COUNT(*) AS c FROM support_calls
      WHERE status='active' AND call_phase IN ('ringing','waiting','connected','accepted','live')
    `),
    inventory_items: safeCount(db, "SELECT COUNT(*) AS c FROM inventory"),
  };

  if (topics.includes("tickets")) {
    const byStatus = rowsOrEmpty(db, `
      SELECT lower(status) AS label, COUNT(*) AS value
      FROM tickets
      WHERE 1=1${ticketDayFilter}
      GROUP BY lower(status) ORDER BY value DESC
    `);
    const byType = rowsOrEmpty(db, `
      SELECT COALESCE(NULLIF(ticket_type,''), 'evidence') AS label, COUNT(*) AS value
      FROM tickets
      WHERE 1=1${ticketDayFilter}
      GROUP BY label ORDER BY value DESC
    `);
    const byDay = lastNDayCounts(db, 14);

    tables.tickets_by_status = byStatus;
    tables.tickets_by_type = byType;
    tables.tickets_by_day = byDay;

    const wantTrend = /\b(trend|over time|daily|timeline|line|last\s*\d+\s*days|14\s*days|creation date|created per day)\b/i.test(message);
    const wantType = (/\b(type|remote support|evidence)\b/i.test(message) || fullReport) && !wantTrend;
    const wantStatus = fullReport
      || (/\b(status|open|closed|how many|count)\b/i.test(message) && !wantTrend)
      || (!wantTrend && !wantType);

    if (wantStatus && byStatus.length) {
      charts.push({
        id: "tickets-status",
        type: preferred === "line" ? "bar" : preferred,
        title: todayOnly ? "Tickets by status (today)" : "Tickets by status",
        description: todayOnly ? "Created today" : "Scoped to your tickets question",
        data: byStatus,
      });
    }
    if (wantType && byType.length) {
      charts.push({
        id: "tickets-type",
        type: preferred === "bar" || fullReport ? "doughnut" : preferred,
        title: todayOnly ? "Tickets by type (today)" : "Tickets by type",
        description: "Evidence vs remote support",
        data: byType,
      });
    }
    if ((wantTrend || (todayOnly && !fullReport)) && byDay.length) {
      const trendType = preferred === "line" || todayOnly ? "line" : (preferred || "bar");
      charts.push({
        id: "tickets-trend",
        type: trendType,
        title: "Tickets created (last 14 days)",
        description: "Daily counts by ticket creation date",
        data: byDay,
      });
    }
    // If topic is tickets but no subtype keywords, show the most relevant single chart.
    if (!charts.some(c => c.id.startsWith("tickets-")) && byStatus.length) {
      charts.push({
        id: "tickets-status",
        type: preferred === "line" ? "bar" : preferred,
        title: todayOnly ? "Tickets by status (today)" : "Tickets by status",
        description: "Based on your query",
        data: byStatus,
      });
    }
  }

  if (topics.includes("support")) {
    const byPhase = rowsOrEmpty(db, `
      SELECT COALESCE(NULLIF(call_phase,''), status, 'unknown') AS label, COUNT(*) AS value
      FROM support_calls
      WHERE 1=1${supportDayFilter}
      GROUP BY label ORDER BY value DESC
    `);
    tables.support_by_phase = byPhase;
    if (byPhase.length) {
      charts.push({
        id: "support-phase",
        type: preferred === "line" ? "bar" : preferred,
        title: todayOnly ? "Expert Engineer calls by phase (today)" : "Expert Engineer calls by phase",
        description: "Scoped to your support question",
        data: byPhase,
      });
    }
  }

  if (topics.includes("inventory")) {
    const byStatus = rowsOrEmpty(db, `
      SELECT COALESCE(NULLIF(status,''), 'unknown') AS label, COUNT(*) AS value
      FROM inventory GROUP BY label ORDER BY value DESC LIMIT 12
    `);
    let byCategory = [];
    try {
      byCategory = rowsOrEmpty(db, `
        SELECT COALESCE(NULLIF(category,''), 'uncategorized') AS label, COUNT(*) AS value
        FROM inventory GROUP BY label ORDER BY value DESC LIMIT 12
      `);
    } catch {
      byCategory = [];
    }
    tables.inventory_by_status = byStatus;
    tables.inventory_by_category = byCategory;
    const wantCategory = /\b(categor(y|ies)|type|types)\b/i.test(message) || fullReport;
    if (wantCategory && byCategory.length) {
      charts.push({
        id: "inventory-category",
        type: preferred === "line" ? "bar" : preferred,
        title: "Inventory by category",
        description: "Scoped to your inventory question",
        data: byCategory,
      });
    }
    if ((!wantCategory || fullReport) && byStatus.length) {
      charts.push({
        id: "inventory-status",
        type: preferred === "line" ? "bar" : (fullReport ? "doughnut" : preferred),
        title: "Inventory by status",
        description: "Scoped to your inventory question",
        data: byStatus,
      });
    }
  }

  return {
    generated_at: new Date().toISOString(),
    summary,
    charts: charts.filter(c => Array.isArray(c.data) && c.data.length),
    tables,
  };
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeAnalyticsCsv(analytics, reportsDir) {
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `mission-analytics-${stamp}.csv`;
  const filePath = path.join(reportsDir, fileName);
  const lines = ["section,label,value"];
  for (const [section, rows] of Object.entries(analytics.tables || {})) {
    for (const row of rows || []) {
      lines.push([section, row.label, row.value].map(csvEscape).join(","));
    }
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
  return { fileName, download_url: `/api/reports/${encodeURIComponent(fileName)}`, path: filePath };
}

async function writeAnalyticsPptx(analytics, reportsDir) {
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `mission-analytics-${stamp}.pptx`;
  const filePath = path.join(reportsDir, fileName);
  const pptx = new PptxGenJS();
  pptx.author = "UAELAB Mission Control";
  pptx.title = "Mission Control Analytics";

  const cover = pptx.addSlide();
  cover.addText("Mission Control Analytics", {
    x: 0.5, y: 1.6, w: 9, h: 0.6, fontSize: 28, bold: true, color: "111827",
  });
  cover.addText(`Topics: ${(analytics.summary.topics || []).join(", ") || "query-scoped"}`, {
    x: 0.5, y: 2.4, w: 9, h: 0.4, fontSize: 14, color: "6B7280",
  });
  cover.addText(`Generated: ${analytics.generated_at}`, {
    x: 0.5, y: 2.9, w: 9, h: 0.3, fontSize: 12, color: "6B7280",
  });

  for (const chart of analytics.charts.slice(0, 6)) {
    const slide = pptx.addSlide();
    slide.addText(chart.title, { x: 0.4, y: 0.3, w: 9, h: 0.45, fontSize: 18, bold: true, color: "111827" });
    if (chart.description) {
      slide.addText(chart.description, { x: 0.4, y: 0.75, w: 9, h: 0.3, fontSize: 12, color: "6B7280" });
    }
    const labels = chart.data.map(d => String(d.label).slice(0, 24));
    const values = chart.data.map(d => Number(d.value) || 0);
    const chartType = chart.type === "line" ? pptx.charts.LINE
      : chart.type === "doughnut" || chart.type === "pie" ? pptx.charts.DOUGHNUT
      : pptx.charts.BAR;
    slide.addChart(chartType, [{ name: chart.title, labels, values }], {
      x: 0.5,
      y: 1.2,
      w: 9,
      h: 4.2,
      showTitle: false,
      showLegend: chart.type === "doughnut" || chart.type === "pie",
      chartColors: ["E00800", "111827", "6B7280", "F59E0B", "10B981", "3B82F6"],
    });
  }

  await pptx.writeFile({ fileName: filePath });
  return { fileName, download_url: `/api/reports/${encodeURIComponent(fileName)}`, path: filePath };
}

function buildReply(analytics, message, { pptxUrl, excelUrl }) {
  const topics = analytics.summary.topics || [];
  const chartTitles = analytics.charts.map(c => c.title);
  const todayNote = analytics.summary.today_only ? " (today)" : "";
  const lines = [
    `Analysis for your question — showing ${analytics.charts.length} chart${analytics.charts.length === 1 ? "" : "s"} on: ${topics.join(", ") || "your query"}${todayNote}.`,
    "",
  ];
  if (topics.includes("tickets")) {
    lines.push(`• Tickets${todayNote}: ${analytics.summary.tickets_total} total · ${analytics.summary.tickets_open} open · ${analytics.summary.tickets_closed} closed`);
  }
  if (topics.includes("support")) {
    lines.push(`• Expert Engineer calls${todayNote}: ${analytics.summary.support_total} total · ${analytics.summary.support_active} active now`);
  }
  if (topics.includes("inventory")) {
    lines.push(`• Inventory items total: ${analytics.summary.inventory_items}`);
  }
  if (chartTitles.length) {
    lines.push("", "Charts included:");
    lines.push(...chartTitles.map(t => `• ${t}`));
  }
  if (pptxUrl) lines.push("", `PPTX: ${pptxUrl}`);
  if (excelUrl) lines.push(`Excel (CSV): ${excelUrl}`);
  return lines.join("\n");
}

async function handleAnalyticsChat(db, message, history = [], reportsDir) {
  const effectiveMessage = resolveAnalyticsMessage(message, history);
  if (!effectiveMessage) return null;

  const lower = String(effectiveMessage || "").toLowerCase();
  const wantsPptx = /\b(pptx|powerpoint|slides?|presentation|deck)\b/.test(lower);
  const wantsExcel = /\b(excel|xlsx|csv|spreadsheet)\b/.test(lower);
  const wantsFiles = wantsPptx || wantsExcel
    || wantsFullLabReport(effectiveMessage)
    || (/\b(export|download|prepare|share|full report|complete report)\b/.test(lower)
      && /\b(analysis|analytics|chart|charts|report)\b/.test(lower));

  const analytics = collectScopedAnalytics(db, effectiveMessage);
  if (!analytics.charts.length) {
    return {
      reply: "I understood you want a chart, but I need a clearer subject — e.g. “bar chart of open vs closed tickets”, “pie chart of inventory by status”, or “analyze Expert Engineer calls”.",
      source: "local-analytics",
      charts: [],
      agent: "chat",
      agent_name: "Mission Control (Lab Manager)",
      action: null,
    };
  }

  let pptxUrl = "";
  let excelUrl = "";
  if (wantsFiles) {
    if (wantsPptx || !wantsExcel) {
      const pptx = await writeAnalyticsPptx(analytics, reportsDir);
      pptxUrl = pptx.download_url;
    }
    if (wantsExcel || !wantsPptx) {
      const csv = writeAnalyticsCsv(analytics, reportsDir);
      excelUrl = csv.download_url;
    }
  }

  const reply = buildReply(analytics, effectiveMessage, { pptxUrl, excelUrl });
  return {
    reply: isAffirmation(message)
      ? `Confirmed — here is your chart.\n\n${reply}`
      : reply,
    source: "local-analytics",
    charts: analytics.charts,
    analytics: { summary: analytics.summary, generated_at: analytics.generated_at },
    download_url: pptxUrl || "",
    excel_url: excelUrl || "",
    agent: "chat",
    agent_name: "Mission Control (Lab Manager)",
    action: null,
  };
}

module.exports = {
  wantsAnalytics,
  inferTopics,
  collectScopedAnalytics,
  collectAnalytics: (db) => collectScopedAnalytics(db, "analyze mission control overview charts"),
  writeAnalyticsCsv,
  writeAnalyticsPptx,
  handleAnalyticsChat,
  resolveAnalyticsMessage,
};
