const fs = require("node:fs");
const path = require("node:path");
const PptxGenJS = require("pptxgenjs");

function parseTicketReportScope(text) {
  const lower = String(text || "").toLowerCase();
  if (/\b(image|images|img|screenshot|screenshots|photo|photos|picture|pictures|having images|with images|with evidence)\b/.test(lower)) {
    return "with_images";
  }
  if (/\b(today|todays)\b/.test(lower)) return "today";
  if (/\bopen\b/.test(lower) && !/\b(all|total|every|closed)\b/.test(lower)) return "open";
  if (/\bclosed\b/.test(lower)) return "closed";
  if (/\b(all|total|every|entire|full)\b/.test(lower)) return "all";
  return null;
}

function wantsTicketPptx(text) {
  const lower = String(text || "").toLowerCase();
  // Leave chart/analysis exports to mission-analytics generative UI.
  if (/\b(analy[sz]e|analysis|analytics|chart|charts|graph|graphs|dashboard|kpi)\b/.test(lower)) return false;
  const mentionsTickets = /\btickets?\b/.test(lower) || /\beviden[cs]e\b/.test(lower);
  const mentionsDeck = /\b(pptx|powerpoint|\.ppt\b|ppt\b|slide\s*deck|presentation|slides?)\b/.test(lower);
  const exportVerb = /\b(create|generate|make|export|build|prepare|download)\b/.test(lower);
  if (mentionsDeck && (mentionsTickets || exportVerb)) return true;
  if (exportVerb && mentionsTickets && /\b(report|summary|deck|slides?|images?)\b/.test(lower)) return true;
  return false;
}

function wantsReportDownloadFollowUp(text, history = []) {
  const lower = String(text || "").toLowerCase().trim();
  const asksLink = /\b(link|url|download)\b/.test(lower)
    && /\b(give|get|send|share|provide|download|link|url|again|please)\b/.test(lower);
  if (!asksLink && !/^(download(\s+(link|pptx|it|file)?)?|link(\s+please)?)[.!?]?$/.test(lower)) {
    return false;
  }
  const prior = (history || []).some(m =>
    /\/api\/reports\/|\.pptx|powerpoint from local|created powerpoint/i.test(String(m.content || "")),
  );
  return prior || /\b(pptx|powerpoint|report|ticket)\b/.test(lower);
}

function extractReportUrlFromHistory(history = []) {
  for (const m of [...(history || [])].reverse()) {
    const match = String(m.content || "").match(/\/api\/reports\/[\w.-]+\.pptx/i);
    if (match) return match[0];
  }
  return null;
}

function latestReportDownload(reportsDir) {
  try {
    if (!fs.existsSync(reportsDir)) return null;
    const files = fs.readdirSync(reportsDir)
      .filter(f => /^tickets-[\w.-]+\.pptx$/i.test(f))
      .map(f => ({ f, t: fs.statSync(path.join(reportsDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    if (!files.length) return null;
    return `/api/reports/${encodeURIComponent(files[0].f)}`;
  } catch {
    return null;
  }
}

function isScopeOnlyReply(text) {
  return /^(all|total|open|closed|today|todays|images?|with[_ ]?images?)(\s+tickets?)?[.!?]?$/i.test(String(text || "").trim());
}

function pendingPptxClarification(history = []) {
  const last = [...(history || [])].reverse().find(m => m?.role === "assistant");
  if (!last) return false;
  return /which ticket set|reply with one of|all \/ open \/ today/i.test(String(last.content || ""));
}

function ticketHasImageEvidence(row) {
  const raw = String(row.evidence_data || "");
  if (raw.length < 40) return false;
  if (/^data:image\//i.test(raw)) return true;
  if (raw.trimStart().startsWith("[")) {
    try {
      const frames = JSON.parse(raw);
      return Array.isArray(frames) && frames.some(f => /^data:image\//i.test(String(f || "")));
    } catch {
      return false;
    }
  }
  return false;
}

function extractEvidenceImages(ticket, max = 2) {
  const raw = String(ticket.evidence_data || "");
  if (!raw) return [];
  if (/^data:image\//i.test(raw)) return [raw];
  if (raw.trimStart().startsWith("[")) {
    try {
      const frames = JSON.parse(raw);
      return (Array.isArray(frames) ? frames : [])
        .map(f => String(f || ""))
        .filter(f => /^data:image\//i.test(f))
        .slice(0, max);
    } catch {
      return [];
    }
  }
  return [];
}

function loadTicketsForScope(db, scope = "all") {
  const base = `
    SELECT ticket_code, title, description, status, evidence_type, ticket_type, device, created_at, evidence_data, frame_count
    FROM tickets
  `;
  if (scope === "open") {
    return db.prepare(`${base} WHERE status='open' ORDER BY id DESC LIMIT 200`).all();
  }
  if (scope === "closed") {
    return db.prepare(`${base} WHERE status='closed' ORDER BY id DESC LIMIT 200`).all();
  }
  if (scope === "today") {
    return db.prepare(`${base} WHERE date(created_at)=date('now','localtime') ORDER BY id DESC LIMIT 200`).all();
  }
  if (scope === "with_images") {
    const rows = db.prepare(`${base} WHERE length(evidence_data) > 100 ORDER BY id DESC LIMIT 80`).all();
    return rows.filter(ticketHasImageEvidence).slice(0, 40);
  }
  return db.prepare(`${base} ORDER BY id DESC LIMIT 200`).all();
}

function ticketCounts(db) {
  const total = db.prepare("SELECT COUNT(*) AS c FROM tickets").get()?.c || 0;
  const open = db.prepare("SELECT COUNT(*) AS c FROM tickets WHERE status='open'").get()?.c || 0;
  const closed = db.prepare("SELECT COUNT(*) AS c FROM tickets WHERE status='closed'").get()?.c || 0;
  const today = db.prepare("SELECT COUNT(*) AS c FROM tickets WHERE date(created_at)=date('now','localtime')").get()?.c || 0;
  const withEvidence = db.prepare("SELECT COUNT(*) AS c FROM tickets WHERE length(evidence_data) > 100").get()?.c || 0;
  return { total, open, closed, today, with_evidence: withEvidence };
}

function addImageSafe(slide, dataUrl, opts) {
  try {
    slide.addImage({ data: dataUrl, ...opts });
    return true;
  } catch {
    try {
      const bare = String(dataUrl).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
      slide.addImage({ data: bare, ...opts });
      return true;
    } catch {
      return false;
    }
  }
}

async function buildTicketsPptx(db, { scope = "all", reportsDir, includeImages = false }) {
  fs.mkdirSync(reportsDir, { recursive: true });
  const counts = ticketCounts(db);
  const wantImages = includeImages || scope === "with_images";
  const rows = loadTicketsForScope(db, scope);
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const fileName = `tickets-${scope}-${stamp}.pptx`;
  const filePath = path.join(reportsDir, fileName);

  const pptx = new PptxGenJS();
  pptx.author = "Lab AI Mission Control";
  pptx.title = wantImages ? `Evidence tickets with images · ${scope}` : `Evidence tickets · ${scope}`;
  pptx.subject = "Local SQLite ticket export";

  const title = pptx.addSlide();
  title.addText("Lab AI Mission Control", {
    x: 0.5, y: 1.2, w: 9, h: 0.5,
    fontSize: 18, color: "1F4E79", bold: true,
  });
  title.addText(wantImages ? "Evidence tickets with images" : "Evidence tickets report", {
    x: 0.5, y: 1.8, w: 9, h: 0.7,
    fontSize: 30, color: "111111", bold: true,
  });
  title.addText(`Scope: ${scope} · Generated ${new Date().toLocaleString()} · Local Mission Control DB`, {
    x: 0.5, y: 2.7, w: 9, h: 0.5,
    fontSize: 14, color: "555555",
  });

  const summary = pptx.addSlide();
  summary.addText("Ticket totals (local database)", {
    x: 0.5, y: 0.4, w: 9, h: 0.5, fontSize: 22, bold: true, color: "1F4E79",
  });
  summary.addTable([
    [
      { text: "Metric", options: { bold: true, color: "FFFFFF", fill: { color: "1F4E79" } } },
      { text: "Count", options: { bold: true, color: "FFFFFF", fill: { color: "1F4E79" } } },
    ],
    ["Total tickets created", String(counts.total)],
    ["Open (manual close)", String(counts.open)],
    ["Closed", String(counts.closed)],
    ["Created today", String(counts.today)],
    ["With evidence payload", String(counts.with_evidence)],
    [`In this export (${scope})`, String(rows.length)],
  ], {
    x: 0.5, y: 1.0, w: 9, colW: [6.5, 2.5],
    border: { type: "solid", pt: 0.5, color: "CCCCCC" },
    fontSize: 14,
  });

  if (!wantImages) {
    const chunkSize = 8;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const slide = pptx.addSlide();
      slide.addText(`Tickets ${i + 1}–${i + chunk.length} of ${rows.length}`, {
        x: 0.4, y: 0.25, w: 9.2, h: 0.4, fontSize: 16, bold: true, color: "1F4E79",
      });
      const tableRows = [
        ["Code", "Title", "Status", "Evidence", "Created"].map(h => ({
          text: h, options: { bold: true, color: "FFFFFF", fill: { color: "1F4E79" } },
        })),
        ...chunk.map(r => [
          r.ticket_code || "—",
          String(r.title || "").slice(0, 48) || "—",
          r.status || "—",
          r.evidence_type || "—",
          String(r.created_at || "").slice(0, 16),
        ]),
      ];
      slide.addTable(tableRows, {
        x: 0.3, y: 0.8, w: 9.4, colW: [2.0, 3.4, 1.2, 1.2, 1.6],
        border: { type: "solid", pt: 0.4, color: "DDDDDD" },
        fontSize: 11,
        valign: "middle",
      });
    }
  }

  let imageSlides = 0;
  if (wantImages) {
    for (const row of rows) {
      const images = extractEvidenceImages(row, 2);
      if (!images.length) continue;
      const slide = pptx.addSlide();
      slide.addText(`${row.ticket_code || "Ticket"} · ${String(row.title || "Evidence").slice(0, 60)}`, {
        x: 0.4, y: 0.2, w: 9.2, h: 0.35, fontSize: 14, bold: true, color: "1F4E79",
      });
      slide.addText(`${row.status || "—"} · ${row.evidence_type || "evidence"} · ${String(row.created_at || "").slice(0, 16)}`, {
        x: 0.4, y: 0.5, w: 9.2, h: 0.28, fontSize: 11, color: "666666",
      });
      slide.addText(String(row.description || "").slice(0, 160) || "No description", {
        x: 0.4, y: 0.78, w: 9.2, h: 0.35, fontSize: 11, color: "333333",
      });
      const ok = addImageSafe(slide, images[0], {
        x: 0.5, y: 1.25, w: 9.0, h: 3.9,
        sizing: { type: "contain", w: 9.0, h: 3.9 },
      });
      if (!ok) {
        slide.addText("(Could not embed evidence image for this ticket)", {
          x: 0.5, y: 2.5, w: 9, h: 0.4, fontSize: 14, color: "AA0000",
        });
      } else {
        imageSlides += 1;
      }
      // Optional second frame for video-frame evidence
      if (images[1]) {
        const slide2 = pptx.addSlide();
        slide2.addText(`${row.ticket_code} · frame 2`, {
          x: 0.4, y: 0.25, w: 9.2, h: 0.4, fontSize: 14, bold: true, color: "1F4E79",
        });
        if (addImageSafe(slide2, images[1], {
          x: 0.5, y: 0.8, w: 9.0, h: 4.3,
          sizing: { type: "contain", w: 9.0, h: 4.3 },
        })) imageSlides += 1;
      }
    }
  }

  if (!rows.length) {
    const empty = pptx.addSlide();
    empty.addText(
      wantImages
        ? "No evidence tickets with images were found in the local database."
        : `No tickets matched scope “${scope}”.`,
      { x: 0.5, y: 2.2, w: 9, h: 0.6, fontSize: 18, color: "666666" },
    );
  }

  await pptx.writeFile({ fileName: filePath });
  return {
    fileName,
    filePath,
    scope,
    counts,
    exported: rows.length,
    image_slides: imageSlides,
    include_images: wantImages,
    download_url: `/api/reports/${encodeURIComponent(fileName)}`,
  };
}

async function handleTicketPptxChat(db, message, history = [], reportsDir) {
  const lower = String(message || "").trim().toLowerCase();
  const fromClarify = pendingPptxClarification(history) && isScopeOnlyReply(message);
  const followUpDownload = wantsReportDownloadFollowUp(message, history);

  if (followUpDownload && !wantsTicketPptx(message) && !fromClarify) {
    const existing = extractReportUrlFromHistory(history) || latestReportDownload(reportsDir);
    if (existing) {
      return {
        reply: [
          "Here is the download link for the ticket PowerPoint (staying in Mission Control chat):",
          existing,
          "",
          "Use the Download PPTX button below — no need to open another agent screen.",
        ].join("\n"),
        source: "local-db",
        action: null,
        download_url: existing,
        data: { report: "relink", download_url: existing },
      };
    }
  }

  const wants = wantsTicketPptx(message) || fromClarify || (followUpDownload && !latestReportDownload(reportsDir));
  if (!wants) return null;

  let scope = parseTicketReportScope(message);
  if (!scope && fromClarify) {
    if (/^(total|all)/.test(lower)) scope = "all";
    else if (/^todays?/.test(lower)) scope = "today";
    else if (/image/.test(lower)) scope = "with_images";
    else scope = lower.replace(/\s+tickets?\.?!?$/, "").trim();
  }

  // Clear intents execute immediately — do not ask again.
  if (!scope && /\b(image|images|screenshot|photo|picture)\b/.test(lower)) scope = "with_images";
  if (!scope && /\b(total|all|every|entire|created)\b/.test(lower)) scope = "all";
  if (!scope && followUpDownload) scope = "all";
  // "make slides / ppt of tickets" → run with images when evidence/slides asked, else all
  if (!scope && wantsTicketPptx(message)) {
    scope = /\b(slide|slides|image|images|evidence|screenshot)\b/.test(lower) ? "with_images" : "all";
  }

  const includeImages = scope === "with_images" || /\b(image|images|screenshot|photo|picture|slides?)\b/.test(lower);
  const result = await buildTicketsPptx(db, { scope: scope || "all", reportsDir, includeImages });
  return {
    reply: [
      result.include_images
        ? `Created PowerPoint with evidence images from local Mission Control DB.`
        : `Created PowerPoint from local Mission Control DB.`,
      `Scope: ${result.scope} · Tickets: ${result.exported}`
        + (result.include_images ? ` · Image slides: ${result.image_slides}` : ""),
      `Totals — all: ${result.counts.total}, open: ${result.counts.open}, with evidence: ${result.counts.with_evidence}, today: ${result.counts.today}`,
      "",
      `Download link: ${result.download_url}`,
      "",
      "Click Download PPTX below — stays in this chat.",
    ].join("\n"),
    source: "local-db",
    action: null,
    download_url: result.download_url,
    file_name: result.fileName,
    data: { report: result },
  };
}

module.exports = {
  parseTicketReportScope,
  wantsTicketPptx,
  wantsReportDownloadFollowUp,
  buildTicketsPptx,
  handleTicketPptxChat,
  ticketCounts,
};
