/**
 * CopilotKit-style generative chart cards for Mission Control chat.
 * Uses Chart.js from CDN (loaded in index.html).
 */

const CHART_COLORS = ["#E00800", "#111827", "#6B7280", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6"];
const mountedCharts = new Map();

function destroyChatCharts() {
  for (const chart of mountedCharts.values()) {
    try { chart.destroy(); } catch { /* ignore */ }
  }
  mountedCharts.clear();
}

function chartCardHtml(chart, index) {
  const id = `chat-chart-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
  return `<article class="genui-card chart-card" data-chart-id="${id}">
    <header class="genui-card-head">
      <div>
        <strong>${escapeChartText(chart.title || "Chart")}</strong>
        ${chart.description ? `<p>${escapeChartText(chart.description)}</p>` : ""}
      </div>
      <span class="genui-badge">${escapeChartText(chart.type || "bar")}</span>
    </header>
    <div class="chart-canvas-wrap"><canvas id="${id}" aria-label="${escapeChartText(chart.title || "chart")}"></canvas></div>
  </article>`;
}

function escapeChartText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function analyticsExportsHtml(message) {
  const bits = [];
  if (message.download_url) {
    bits.push(`<a class="chat-dl-btn" href="${message.download_url}" download>Download PPTX</a>`);
  }
  if (message.excel_url) {
    bits.push(`<a class="chat-dl-btn secondary" href="${message.excel_url}" download>Download Excel CSV</a>`);
  }
  if (!bits.length) return "";
  return `<div class="genui-exports">${bits.join("")}</div>`;
}

function chartsMarkup(charts = []) {
  if (!Array.isArray(charts) || !charts.length) return "";
  return `<div class="genui-stack">${charts.map((c, i) => chartCardHtml(c, i)).join("")}</div>`;
}

function statusChipClass(value) {
  const v = String(value || "").toLowerCase();
  if (v.includes("open") || v.includes("live") || v.includes("waiting") || v.includes("ringing")) return "warn";
  if (v.includes("closed") || v.includes("ended") || v.includes("ready") || v.includes("available")) return "ok";
  return "";
}

function tableCardHtml(table, index) {
  const cols = Array.isArray(table.columns) ? table.columns : [];
  const rows = Array.isArray(table.rows) ? table.rows : [];
  const head = cols.map(c => `<th>${escapeChartText(c)}</th>`).join("");
  const body = rows.map(row => {
    const cells = (Array.isArray(row) ? row : []).map((cell, ci) => {
      const text = String(cell ?? "");
      const col = String(cols[ci] || "").toLowerCase();
      if (col === "status" || col === "phase") {
        const cls = statusChipClass(text);
        return `<td><span class="table-chip ${cls}">${escapeChartText(text)}</span></td>`;
      }
      return `<td>${escapeChartText(text)}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<article class="genui-card table-card" data-table-index="${index}">
    <header class="genui-card-head">
      <div>
        <strong>${escapeChartText(table.title || "Table")}</strong>
        ${table.description ? `<p>${escapeChartText(table.description)}</p>` : ""}
      </div>
      <span class="genui-badge">table</span>
    </header>
    <div class="genui-table-wrap">
      <table class="genui-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${body || `<tr><td colspan="${Math.max(cols.length, 1)}" class="muted">No rows</td></tr>`}</tbody>
      </table>
    </div>
  </article>`;
}

function tablesMarkup(tables = []) {
  if (!Array.isArray(tables) || !tables.length) return "";
  return `<div class="genui-stack">${tables.map((t, i) => tableCardHtml(t, i)).join("")}</div>`;
}

/** Convert markdown pipe-tables in escaped HTML (with <br>) into smart table cards. */
function renderMarkdownTablesInHtml(escapedWithBr) {
  const text = String(escapedWithBr || "").replace(/<br\s*\/?>/gi, "\n");
  const lines = text.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1] || "";
    const isHeader = /^\s*\|.+\|\s*$/.test(line) && /^\s*\|?\s*:?-{3,}/.test(next);
    if (!isHeader) {
      out.push(line);
      i += 1;
      continue;
    }
    const block = [line, next];
    i += 2;
    while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
      block.push(lines[i]);
      i += 1;
    }
    const parsed = parseMarkdownTableBlock(block);
    if (parsed) {
      out.push(tablesMarkup([parsed]).replace(/^<div class="genui-stack">/, "").replace(/<\/div>$/, ""));
      // Keep as raw HTML fragment; caller joins carefully
      out[out.length - 1] = `__GENUI_TABLE__${JSON.stringify(parsed)}__END__`;
    } else {
      out.push(...block);
    }
  }
  return out.map(line => {
    if (String(line).startsWith("__GENUI_TABLE__")) {
      const json = String(line).slice("__GENUI_TABLE__".length, -"__END__".length);
      try {
        return tableCardHtml(JSON.parse(json), 0);
      } catch {
        return "";
      }
    }
    return line;
  }).join("<br>").replace(/(?:<br>\s*)+(<article class="genui-card table-card")/g, "$1")
    .replace(/(<\/article>)(?:\s*<br>)+/g, "$1");
}

function parseMarkdownTableBlock(block) {
  if (!block || block.length < 2) return null;
  const splitRow = (row) => row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(c => c.trim()
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/:[a-z_]+:/gi, "")
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
      .trim());
  const columns = splitRow(block[0]).filter(Boolean);
  if (columns.length < 2) return null;
  const rows = [];
  for (let r = 2; r < block.length; r += 1) {
    const cells = splitRow(block[r]);
    if (!cells.length) continue;
    while (cells.length < columns.length) cells.push("");
    rows.push(cells.slice(0, columns.length));
  }
  return {
    id: "md-table",
    title: "Table",
    description: `${rows.length} row${rows.length === 1 ? "" : "s"}`,
    columns,
    rows,
  };
}

function paintChart(canvas, chart) {
  if (!window.Chart || !canvas) return null;
  const labels = (chart.data || []).map(d => String(d.label ?? ""));
  const values = (chart.data || []).map(d => Number(d.value) || 0);
  const type = ["bar", "line", "doughnut", "pie"].includes(chart.type) ? chart.type : "bar";
  const colors = labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);
  return new window.Chart(canvas.getContext("2d"), {
    type,
    data: {
      labels,
      datasets: [{
        label: chart.title || "Value",
        data: values,
        backgroundColor: type === "line" ? "rgba(224,8,0,.18)" : colors,
        borderColor: type === "line" ? "#E00800" : colors,
        borderWidth: type === "line" ? 2 : 0,
        borderRadius: type === "bar" ? 6 : 0,
        tension: 0.35,
        fill: type === "line",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: type === "doughnut" || type === "pie", position: "bottom" },
        tooltip: { backgroundColor: "#111827", titleFont: { weight: "600" } },
      },
      scales: (type === "doughnut" || type === "pie") ? {} : {
        x: { grid: { display: false }, ticks: { color: "#6B7280", maxRotation: 40 } },
        y: { beginAtZero: true, grid: { color: "rgba(0,0,0,.06)" }, ticks: { color: "#6B7280", precision: 0 } },
      },
    },
  });
}

function mountChatCharts(root = document) {
  if (!window.Chart) return;
  root.querySelectorAll(".chart-card[data-chart-id]").forEach(card => {
    const id = card.dataset.chartId;
    const canvas = card.querySelector("canvas");
    if (!id || !canvas || mountedCharts.has(id)) return;
    let payload = null;
    try {
      payload = JSON.parse(card.dataset.chartJson || "null");
    } catch {
      payload = null;
    }
    if (!payload) return;
    const chart = paintChart(canvas, payload);
    if (chart) mountedCharts.set(id, chart);
  });
}

function attachChartPayloads(root, charts) {
  if (!root || !Array.isArray(charts)) return;
  const cards = root.querySelectorAll(".chart-card[data-chart-id]");
  charts.forEach((chart, i) => {
    if (cards[i]) cards[i].dataset.chartJson = JSON.stringify(chart);
  });
}

window.MissionCharts = {
  chartsMarkup,
  tablesMarkup,
  analyticsExportsHtml,
  mountChatCharts,
  destroyChatCharts,
  attachChartPayloads,
  renderMarkdownTablesInHtml,
  parseMarkdownTableBlock,
};
