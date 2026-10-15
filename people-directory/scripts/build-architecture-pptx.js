const PptxGenJS = require("pptxgenjs");
const path = require("path");
const fs = require("fs");

const pptx = new PptxGenJS();
pptx.author = "VisionClaw / UAELAB";
pptx.title = "Lab AI Mission Control - Architecture Overview";
pptx.subject = "Management presentation";

const BRAND = "1B3A4B";
const ACCENT = "0A84FF";
const LIGHT = "F4F7FA";
const DARK = "111827";
const MUTED = "6B7280";
const TOTAL = 10;

function addFooter(slide, n) {
  slide.addText("UAELAB · Lab AI Mission Control · Confidential", {
    x: 0.5,
    y: 5.2,
    w: 7.5,
    h: 0.3,
    fontSize: 10,
    color: MUTED,
    fontFace: "Calibri",
  });
  slide.addText(`${n} / ${TOTAL}`, {
    x: 8.5,
    y: 5.2,
    w: 1,
    h: 0.3,
    fontSize: 10,
    color: MUTED,
    align: "right",
    fontFace: "Calibri",
  });
}

// 1 Title
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 10,
    h: 5.625,
    fill: { color: BRAND },
  });
  s.addText("Lab AI Mission Control", {
    x: 0.7,
    y: 1.6,
    w: 8.5,
    h: 0.7,
    fontSize: 36,
    bold: true,
    color: "FFFFFF",
    fontFace: "Calibri",
  });
  s.addText("Architecture & Operating Model", {
    x: 0.7,
    y: 2.35,
    w: 8.5,
    h: 0.45,
    fontSize: 22,
    color: "A5D6FF",
    fontFace: "Calibri",
  });
  s.addText(
    "Voice-first AI agents for telecom lab operations\nRay-Ban Meta glasses · Phone · Mission Control web console",
    {
      x: 0.7,
      y: 3.1,
      w: 8.5,
      h: 0.7,
      fontSize: 14,
      color: "D1D5DB",
      fontFace: "Calibri",
    },
  );
  s.addText("For management review · Practice deck", {
    x: 0.7,
    y: 4.6,
    w: 8.5,
    h: 0.3,
    fontSize: 12,
    color: "9CA3AF",
    fontFace: "Calibri",
  });
}

// 2 Agenda
{
  const s = pptx.addSlide();
  s.addText("Agenda", {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.5,
    fontSize: 28,
    bold: true,
    color: DARK,
    fontFace: "Calibri",
  });
  [
    "1. Why we built this",
    "2. What the system does (business view)",
    "3. High-level architecture",
    "4. Specialist AI agents",
    "5. End-to-end voice flow",
    "6. Expert Engineer live support",
    "7. Data, security & local control",
    "8. Demo readiness & next steps",
  ].forEach((t, i) => {
    s.addText(t, {
      x: 0.7,
      y: 1.1 + i * 0.42,
      w: 8.5,
      h: 0.38,
      fontSize: 16,
      color: DARK,
      fontFace: "Calibri",
    });
  });
  addFooter(s, 2);
}

// 3 Why
{
  const s = pptx.addSlide();
  s.addText("Why we built this", {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.5,
    fontSize: 28,
    bold: true,
    color: DARK,
    fontFace: "Calibri",
  });
  const cards = [
    {
      t: "Hands-free lab work",
      d: "Engineers keep working while asking inventory, procedures, and support questions by voice.",
    },
    {
      t: "Faster incident proof",
      d: "Capture screenshot/video evidence from glasses and open tracked tickets in seconds.",
    },
    {
      t: "Remote expert help",
      d: "Ring Mission Control and share live glasses video with an Expert Engineer.",
    },
    {
      t: "One control room",
      d: "All agents, tickets, and live sessions visible in a single web Mission Control.",
    },
  ];
  cards.forEach((c, i) => {
    const x = 0.5 + (i % 2) * 4.7;
    const y = 1.1 + Math.floor(i / 2) * 1.8;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x,
      y,
      w: 4.4,
      h: 1.55,
      fill: { color: LIGHT },
      rectRadius: 0.1,
    });
    s.addText(c.t, {
      x: x + 0.25,
      y: y + 0.25,
      w: 3.9,
      h: 0.35,
      fontSize: 16,
      bold: true,
      color: BRAND,
      fontFace: "Calibri",
    });
    s.addText(c.d, {
      x: x + 0.25,
      y: y + 0.7,
      w: 3.9,
      h: 0.65,
      fontSize: 13,
      color: MUTED,
      fontFace: "Calibri",
    });
  });
  addFooter(s, 3);
}

// 4 Business view
{
  const s = pptx.addSlide();
  s.addText("What the system does", {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.5,
    fontSize: 28,
    bold: true,
    color: DARK,
    fontFace: "Calibri",
  });
  s.addText("One platform — three surfaces", {
    x: 0.5,
    y: 0.95,
    w: 9,
    h: 0.35,
    fontSize: 16,
    color: ACCENT,
    fontFace: "Calibri",
  });
  const rows = [
    ["AI Glasses / Phone", "Voice + camera capture in the lab"],
    ["Mission Control (Web)", "Operators answer calls, review tickets, manage agents"],
    ["AI Runtime (OpenClaw)", "Routes natural language to the right specialist agent"],
    ["Local Lab Database", "Inventory, knowledge, tickets, support sessions (source of truth)"],
  ];
  rows.forEach((r, i) => {
    const y = 1.5 + i * 0.7;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.5,
      y,
      w: 9,
      h: 0.58,
      fill: { color: i % 2 ? LIGHT : "FFFFFF" },
      line: { color: "E5E7EB" },
      rectRadius: 0.06,
    });
    s.addText(r[0], {
      x: 0.7,
      y: y + 0.12,
      w: 3.2,
      h: 0.35,
      fontSize: 14,
      bold: true,
      color: DARK,
      fontFace: "Calibri",
    });
    s.addText(r[1], {
      x: 4.0,
      y: y + 0.12,
      w: 5.3,
      h: 0.35,
      fontSize: 14,
      color: MUTED,
      fontFace: "Calibri",
    });
  });
  addFooter(s, 4);
}

// 5 Architecture
{
  const s = pptx.addSlide();
  s.addText("High-level architecture", {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.45,
    fontSize: 28,
    bold: true,
    color: DARK,
    fontFace: "Calibri",
  });
  const boxes = [
    { x: 0.4, y: 1.0, t: "Edge devices", d: "Ray-Ban Meta\nAndroid phone app\nGemini Live voice" },
    { x: 3.5, y: 1.0, t: "Mission Control API", d: "Node.js :8090\nREST + SSE\nSQLite people.db" },
    { x: 6.6, y: 1.0, t: "AI Gateway", d: "OpenClaw :18789\nAgent routing\nTool calling" },
    { x: 0.4, y: 3.0, t: "Live media", d: "WebRTC signaling\nGlasses → Expert video\nEvidence capture" },
    { x: 3.5, y: 3.0, t: "Web console", d: "Mission Control UI\nAgent panels\nSupport queue" },
    { x: 6.6, y: 3.0, t: "Lab data", d: "Inventory\nKnowledge\nTickets / SUP-" },
  ];
  boxes.forEach((b) => {
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: b.x,
      y: b.y,
      w: 2.9,
      h: 1.65,
      fill: { color: LIGHT },
      line: { color: ACCENT },
      rectRadius: 0.08,
    });
    s.addText(b.t, {
      x: b.x + 0.15,
      y: b.y + 0.2,
      w: 2.6,
      h: 0.35,
      fontSize: 14,
      bold: true,
      color: BRAND,
      fontFace: "Calibri",
    });
    s.addText(b.d, {
      x: b.x + 0.15,
      y: b.y + 0.65,
      w: 2.6,
      h: 0.85,
      fontSize: 12,
      color: MUTED,
      fontFace: "Calibri",
    });
  });
  addFooter(s, 5);
}

// 6 Agents
{
  const s = pptx.addSlide();
  s.addText("Specialist AI agents", {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.45,
    fontSize: 28,
    bold: true,
    color: DARK,
    fontFace: "Calibri",
  });
  const agents = [
    ["Lab Inventory", "Locate gear & stock by voice"],
    ["Lab Knowledge", "Procedures & runbooks"],
    ["Visual Troubleshoot", "Analyze screens & alarms"],
    ["Autonomous Tests", "Mobile PS / lab cycles"],
    ["Evidence Tickets", "Screenshot & video proof"],
    ["Expert Engineer", "Live remote support call"],
    ["ab-twin", "Digital Capture from walk-through"],
    ["Mission Control", "Lab manager & router"],
  ];
  agents.forEach((a, i) => {
    const x = 0.5 + (i % 4) * 2.35;
    const y = 1.05 + Math.floor(i / 4) * 1.7;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x,
      y,
      w: 2.2,
      h: 1.45,
      fill: { color: LIGHT },
      rectRadius: 0.08,
    });
    s.addText(a[0], {
      x: x + 0.12,
      y: y + 0.3,
      w: 1.96,
      h: 0.45,
      fontSize: 13,
      bold: true,
      color: BRAND,
      fontFace: "Calibri",
      align: "center",
    });
    s.addText(a[1], {
      x: x + 0.12,
      y: y + 0.8,
      w: 1.96,
      h: 0.45,
      fontSize: 11,
      color: MUTED,
      fontFace: "Calibri",
      align: "center",
    });
  });
  addFooter(s, 6);
}

// 7 Voice flow
{
  const s = pptx.addSlide();
  s.addText("End-to-end voice flow", {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.45,
    fontSize: 28,
    bold: true,
    color: DARK,
    fontFace: "Calibri",
  });
  const steps = [
    { n: "01", t: "Speak", d: "Engineer asks on glasses/phone" },
    { n: "02", t: "Understand", d: "Gemini Live + OpenClaw tools" },
    { n: "03", t: "Act", d: "Query DB / create ticket / start call" },
    { n: "04", t: "Respond", d: "Spoken answer + Mission Control UI update" },
  ];
  steps.forEach((st, i) => {
    const x = 0.45 + i * 2.4;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x,
      y: 1.3,
      w: 2.2,
      h: 2.4,
      fill: { color: LIGHT },
      rectRadius: 0.1,
    });
    s.addText(st.n, {
      x: x + 0.15,
      y: 1.55,
      w: 1.9,
      h: 0.4,
      fontSize: 20,
      bold: true,
      color: ACCENT,
      fontFace: "Calibri",
    });
    s.addText(st.t, {
      x: x + 0.15,
      y: 2.15,
      w: 1.9,
      h: 0.4,
      fontSize: 18,
      bold: true,
      color: DARK,
      fontFace: "Calibri",
    });
    s.addText(st.d, {
      x: x + 0.15,
      y: 2.7,
      w: 1.9,
      h: 0.7,
      fontSize: 13,
      color: MUTED,
      fontFace: "Calibri",
    });
  });
  s.addText(
    'Example: “Create an evidence ticket for this alarm” → ticket code + optional PPTX export in chat.',
    {
      x: 0.5,
      y: 4.1,
      w: 9,
      h: 0.5,
      fontSize: 13,
      color: MUTED,
      fontFace: "Calibri",
    },
  );
  addFooter(s, 7);
}

// 8 Expert Engineer
{
  const s = pptx.addSlide();
  s.addText("Expert Engineer live support", {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.45,
    fontSize: 28,
    bold: true,
    color: DARK,
    fontFace: "Calibri",
  });
  [
    "1. Glasses: “Connect me to Expert Engineer”",
    "2. Mission Control rings (incoming request)",
    "3. Expert answers → WebRTC room opens",
    "4. Glasses video streams to the PC console",
    "5. Call ends → evidence ticket saved (stays open until manually closed)",
  ].forEach((line, i) => {
    s.addText(line, {
      x: 0.7,
      y: 1.1 + i * 0.55,
      w: 8.5,
      h: 0.45,
      fontSize: 16,
      color: DARK,
      fontFace: "Calibri",
    });
  });
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.5,
    y: 4.0,
    w: 9,
    h: 0.75,
    fill: { color: "EEF6FF" },
    rectRadius: 0.08,
  });
  s.addText(
    "Business value: remote experts see what the field engineer sees — without leaving Mission Control.",
    {
      x: 0.7,
      y: 4.15,
      w: 8.6,
      h: 0.45,
      fontSize: 14,
      color: BRAND,
      fontFace: "Calibri",
    },
  );
  addFooter(s, 8);
}

// 9 Data & security
{
  const s = pptx.addSlide();
  s.addText("Data, control & security posture", {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.45,
    fontSize: 28,
    bold: true,
    color: DARK,
    fontFace: "Calibri",
  });
  const left = [
    "Local-first lab database (SQLite)",
    "Tickets / inventory / knowledge stay on-prem",
    "OpenClaw answers only from local context for lab facts",
    "Support sessions tracked as SUP- codes",
  ];
  const right = [
    "API tokens for OpenClaw gateway",
    "WebRTC for live media (signaling + TURN)",
    "Evidence tickets can export to PowerPoint",
    "Operator closes evidence tickets manually",
  ];
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.5,
    y: 1.05,
    w: 4.4,
    h: 3.5,
    fill: { color: LIGHT },
    rectRadius: 0.1,
  });
  s.addText("Control of data", {
    x: 0.75,
    y: 1.25,
    w: 3.9,
    h: 0.4,
    fontSize: 16,
    bold: true,
    color: BRAND,
    fontFace: "Calibri",
  });
  left.forEach((l, i) =>
    s.addText("•  " + l, {
      x: 0.75,
      y: 1.85 + i * 0.55,
      w: 3.9,
      h: 0.5,
      fontSize: 13,
      color: DARK,
      fontFace: "Calibri",
    }),
  );
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 5.1,
    y: 1.05,
    w: 4.4,
    h: 3.5,
    fill: { color: LIGHT },
    rectRadius: 0.1,
  });
  s.addText("Safe operations", {
    x: 5.35,
    y: 1.25,
    w: 3.9,
    h: 0.4,
    fontSize: 16,
    bold: true,
    color: BRAND,
    fontFace: "Calibri",
  });
  right.forEach((l, i) =>
    s.addText("•  " + l, {
      x: 5.35,
      y: 1.85 + i * 0.55,
      w: 3.9,
      h: 0.5,
      fontSize: 13,
      color: DARK,
      fontFace: "Calibri",
    }),
  );
  addFooter(s, 9);
}

// 10 Next steps
{
  const s = pptx.addSlide();
  s.addText("Demo readiness & ask", {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.45,
    fontSize: 28,
    bold: true,
    color: DARK,
    fontFace: "Calibri",
  });
  s.addText("Ready to show today", {
    x: 0.5,
    y: 1.0,
    w: 9,
    h: 0.35,
    fontSize: 16,
    bold: true,
    color: ACCENT,
    fontFace: "Calibri",
  });
  [
    "Voice inventory / knowledge lookup",
    "Evidence ticket creation from glasses",
    "Expert Engineer live ring + Mission Control queue",
    "Agent-based Mission Control console",
  ].forEach((t, i) => {
    s.addText("✓  " + t, {
      x: 0.7,
      y: 1.45 + i * 0.4,
      w: 8.5,
      h: 0.35,
      fontSize: 15,
      color: DARK,
      fontFace: "Calibri",
    });
  });
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.5,
    y: 3.3,
    w: 9,
    h: 1.4,
    fill: { color: BRAND },
    rectRadius: 0.1,
  });
  s.addText("Ask of management", {
    x: 0.75,
    y: 3.5,
    w: 8.5,
    h: 0.35,
    fontSize: 14,
    bold: true,
    color: "A5D6FF",
    fontFace: "Calibri",
  });
  s.addText(
    "Approve continued pilot in UAELAB · expand agent coverage · formalize support operating procedure for Expert Engineer live calls.",
    {
      x: 0.75,
      y: 3.95,
      w: 8.5,
      h: 0.55,
      fontSize: 14,
      color: "FFFFFF",
      fontFace: "Calibri",
    },
  );
  addFooter(s, 10);
}

const out = path.join(
  __dirname,
  "..",
  "data",
  "reports",
  "Lab-AI-Mission-Control-Architecture-Management.pptx",
);
fs.mkdirSync(path.dirname(out), { recursive: true });
pptx.writeFile({ fileName: out }).then(() => {
  console.log("WROTE", out);
});
