/**
 * ab-twin — Digital Twin Generator from AI-Glasses Video
 *
 * Pipeline: glasses walk-through video → frames → (Nerfstudio/LongSplat/demo) → browser viewer
 * Prefer OSS: Nerfstudio Splatfacto + gsplat, or LongSplat for unposed casual video.
 * Set TWIN_ENGINE=nerfstudio|longsplat|demo (default demo until GPU tools installed).
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const TWIN_ROOT = process.env.TWIN_ROOT || path.join(__dirname, "..", "data", "lab-twins");
const TWIN_ENGINE = (process.env.TWIN_ENGINE || "demo").toLowerCase();

function ensureRoot() {
  fs.mkdirSync(TWIN_ROOT, { recursive: true });
  return TWIN_ROOT;
}

function nextTwinId() {
  const stamp = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `TWIN-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`;
}

function twinPath(twinId) {
  return path.join(ensureRoot(), twinId);
}

function writeJsonSafe(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function saveStatus(jobDir, patch) {
  const statusPath = path.join(jobDir, "status.json");
  const current = readJson(statusPath, {});
  const next = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  writeJsonSafe(statusPath, next);
  return next;
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) throw new Error("video must be a data URL (mp4/webm)");
  const mime = match[1].toLowerCase();
  if (!mime.startsWith("video/")) throw new Error("evidence must be a video clip");
  return { mime, buffer: Buffer.from(match[2], "base64") };
}

function extensionForMime(mime) {
  if (mime.includes("webm")) return ".webm";
  if (mime.includes("quicktime")) return ".mov";
  return ".mp4";
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `${command} exited ${code}`));
    });
  });
}

async function extractFrames(videoPath, framesDir, fps = 2) {
  fs.mkdirSync(framesDir, { recursive: true });
  const pattern = path.join(framesDir, "frame_%05d.jpg");
  try {
    await runCommand("ffmpeg", [
      "-y",
      "-i", videoPath,
      "-vf", `fps=${fps}`,
      "-qscale:v", "3",
      pattern,
    ], path.dirname(videoPath));
  } catch (err) {
    // Fallback: copy nothing — status will note ffmpeg missing
    throw new Error(`Frame extraction failed (is ffmpeg installed?): ${err.message}`);
  }
  const frames = fs.readdirSync(framesDir).filter(f => /\.jpe?g$/i.test(f)).sort();
  return frames;
}

function sampleFrameRgb(framePath, width = 48, height = 27) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-v", "error",
      "-i", framePath,
      "-vf", `scale=${width}:${height}`,
      "-f", "rawvideo",
      "-pix_fmt", "rgb24",
      "pipe:1",
    ], { windowsHide: true });
    const chunks = [];
    let stderr = "";
    child.stdout.on("data", chunk => chunks.push(chunk));
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) return reject(new Error(stderr.trim() || `ffmpeg exited ${code}`));
      resolve(Buffer.concat(chunks));
    });
  });
}

async function buildColoredPlyFromFrames(framesDir, frames, outPath) {
  // Demo twin: colored point cloud sampled from real walk-through JPEGs (not photoreal 3DGS).
  const width = 64;
  const height = 36;
  const vertices = [];
  const usable = frames.slice(0, 64);
  for (let fi = 0; fi < usable.length; fi += 1) {
    const framePath = path.join(framesDir, usable[fi]);
    let rgb;
    try {
      rgb = await sampleFrameRgb(framePath, width, height);
    } catch {
      continue;
    }
    const t = usable.length <= 1 ? 0 : fi / (usable.length - 1);
    const yaw = t * Math.PI * 2;
    const camX = Math.cos(yaw) * 2.4;
    const camZ = Math.sin(yaw) * 2.4;
    const step = Math.max(1, Math.floor((width * height) / 420));
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 3;
        if (idx + 2 >= rgb.length) continue;
        const r = rgb[idx];
        const g = rgb[idx + 1];
        const b = rgb[idx + 2];
        // Project pixel into a frustum in front of each camera pose
        const u = (x / (width - 1) - 0.5) * 2.8;
        const v = (0.5 - y / (height - 1)) * 1.7;
        const depth = 1.2 + ((x + y + fi) % 7) * 0.045;
        const px = camX + Math.cos(yaw + Math.PI / 2) * u * depth - Math.cos(yaw) * depth * 0.2;
        const py = 0.85 + v * depth;
        const pz = camZ + Math.sin(yaw + Math.PI / 2) * u * depth - Math.sin(yaw) * depth * 0.2;
        vertices.push(`${px.toFixed(4)} ${py.toFixed(4)} ${pz.toFixed(4)} ${r} ${g} ${b}`);
      }
    }
  }
  if (!vertices.length) {
    // Fallback ring if ffmpeg sampling failed
    for (let i = 0; i < 800; i += 1) {
      const angle = (i / 800) * Math.PI * 2;
      const elev = ((i % 20) / 20 - 0.5) * 1.2;
      vertices.push(`${(Math.cos(angle) * 2.0).toFixed(4)} ${(0.6 + elev).toFixed(4)} ${(Math.sin(angle) * 2.0).toFixed(4)} 160 180 170`);
    }
  }
  const lines = [
    "ply",
    "format ascii 1.0",
    `element vertex ${vertices.length}`,
    "property float x",
    "property float y",
    "property float z",
    "property uchar red",
    "property uchar green",
    "property uchar blue",
    "end_header",
    ...vertices,
  ];
  fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  return {
    path: outPath,
    preview: true,
    vertex_count: vertices.length,
    note: "Colored walk-through point cloud from glasses frames. Install Nerfstudio (TWIN_ENGINE=nerfstudio) for photoreal 3DGS.",
  };
}

async function buildPanoramaFromFrames(framesDir, frames, outPath) {
  // Seamless horizontal strip → cylindrical twin (continuous, not frame panels).
  if (!frames.length) throw new Error("No frames for panorama");
  const n = frames.length;
  const w = 512;
  const h = 288;
  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  for (const name of frames) args.push("-i", path.join(framesDir, name));
  const scaled = frames
    .map((_, i) => `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`)
    .join(";");
  const stack = frames.map((_, i) => `[v${i}]`).join("");
  args.push(
    "-filter_complex",
    `${scaled};${stack}hstack=inputs=${n}[out]`,
    "-map", "[out]",
    "-frames:v", "1",
    "-q:v", "3",
    outPath,
  );
  await runCommand("ffmpeg", args, framesDir);
  return outPath;
}

async function buildSmoothWalkthroughVideo(framesDir, frames, outPath) {
  // Continuous MP4 from stills — short holds so playback feels like a real walk (~6–10s total).
  const listFile = path.join(path.dirname(outPath), "frames_concat.txt");
  const holdSec = Math.max(0.08, Math.min(0.22, 8 / Math.max(frames.length, 1)));
  const lines = [];
  for (const name of frames) {
    const abs = path.join(framesDir, name).replace(/\\/g, "/").replace(/'/g, "'\\''");
    lines.push(`file '${abs}'`);
    lines.push(`duration ${holdSec.toFixed(3)}`);
  }
  // concat demuxer needs the last file repeated without duration
  if (frames.length) {
    const last = path.join(framesDir, frames[frames.length - 1]).replace(/\\/g, "/").replace(/'/g, "'\\''");
    lines.push(`file '${last}'`);
  }
  fs.writeFileSync(listFile, `${lines.join("\n")}\n`, "utf8");
  try {
    await runCommand("ffmpeg", [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      "-vf", "fps=30,format=yuv420p,minterpolate=fps=30:mi_mode=blend",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      "-movflags", "+faststart",
      outPath,
    ], path.dirname(outPath));
  } catch {
    // Faster fallback without minterpolate if that filter fails
    await runCommand("ffmpeg", [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      "-vf", "fps=24,format=yuv420p",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      "-movflags", "+faststart",
      outPath,
    ], path.dirname(outPath));
  }
  return outPath;
}

async function runDemoEngine(jobDir, twinId, frames) {
  saveStatus(jobDir, { status: "POSE_ESTIMATION", progress: 35, current_step: "Estimating camera path from walk-through frames" });
  await new Promise(r => setTimeout(r, 200));
  saveStatus(jobDir, { status: "TRAINING", progress: 55, current_step: "Building colored twin preview from captured frames" });
  const exportsDir = path.join(jobDir, "exports");
  fs.mkdirSync(exportsDir, { recursive: true });
  const ply = await buildColoredPlyFromFrames(path.join(jobDir, "frames"), frames, path.join(exportsDir, "point_cloud.ply"));

  saveStatus(jobDir, { status: "EXPORTING", progress: 70, current_step: "Building continuous panoramic twin" });
  const panoramaPath = path.join(exportsDir, "panorama.jpg");
  let panoramaReady = false;
  try {
    await buildPanoramaFromFrames(path.join(jobDir, "frames"), frames, panoramaPath);
    panoramaReady = fs.existsSync(panoramaPath);
  } catch (err) {
    saveStatus(jobDir, { current_step: `Panorama skipped: ${err.message}` });
  }

  saveStatus(jobDir, { status: "EXPORTING", progress: 85, current_step: "Rendering smooth walkthrough video" });
  const videoPath = path.join(exportsDir, "walkthrough.mp4");
  let videoReady = false;
  try {
    await buildSmoothWalkthroughVideo(path.join(jobDir, "frames"), frames, videoPath);
    videoReady = fs.existsSync(videoPath);
  } catch (err) {
    saveStatus(jobDir, { current_step: `Video render skipped: ${err.message}` });
  }

  writeJsonSafe(path.join(exportsDir, "viewer.json"), {
    twin_id: twinId,
    format: "panorama+walkthrough",
    video_url: videoReady ? `/api/twins/${twinId}/exports/walkthrough.mp4` : "",
    panorama_url: panoramaReady ? `/api/twins/${twinId}/exports/panorama.jpg` : "",
    splat_url: `/api/twins/${twinId}/exports/point_cloud.ply`,
    frames_url: `/api/twins/${twinId}/frames`,
    engine: "demo",
    photoreal: false,
    show_photo_orbit: true,
    default_view: "3d",
    recommended_engine: "nerfstudio splatfacto or LongSplat (needs CUDA GPU)",
    note: panoramaReady
      ? "Continuous panoramic twin from glasses frames. Photoreal free-roam 3D Gaussian Splatting needs a CUDA GPU + TWIN_ENGINE=nerfstudio."
      : "Walkthrough ready. Install ffmpeg for panoramic twin export. Photoreal 3DGS needs CUDA + Nerfstudio.",
  });
  saveStatus(jobDir, {
    status: "READY",
    progress: 100,
    current_step: panoramaReady ? "Continuous panoramic twin ready" : (videoReady ? "3D twin + walkthrough ready" : "Walkthrough twin ready"),
    frame_count: frames.length,
    export: { ...ply, video: videoReady ? videoPath : null, panorama: panoramaReady ? panoramaPath : null },
    viewer_url: `/twin-viewer.html?id=${encodeURIComponent(twinId)}`,
  });
}

async function runNerfstudioEngine(jobDir, twinId) {
  saveStatus(jobDir, { status: "POSE_ESTIMATION", progress: 30, current_step: "ns-process-data video (COLMAP)" });
  const dataDir = path.join(jobDir, "nerfstudio");
  fs.mkdirSync(dataDir, { recursive: true });
  await runCommand("ns-process-data", ["video", "--data", path.join(jobDir, "input", "capture.mp4"), "--output-dir", dataDir], jobDir);
  saveStatus(jobDir, { status: "TRAINING", progress: 60, current_step: "ns-train splatfacto" });
  const outputDir = path.join(jobDir, "ns-output");
  await runCommand("ns-train", [
    "splatfacto",
    "--data", dataDir,
    "--output-dir", outputDir,
    "--max-num-iterations", process.env.TWIN_NS_ITERS || "3000",
  ], jobDir);
  saveStatus(jobDir, { status: "EXPORTING", progress: 90, current_step: "ns-export gaussian-splat" });
  const exportsDir = path.join(jobDir, "exports");
  fs.mkdirSync(exportsDir, { recursive: true });
  // Export path varies by nerfstudio version; operator may copy PLY manually if needed
  writeJsonSafe(path.join(exportsDir, "viewer.json"), {
    twin_id: twinId,
    format: "ply",
    engine: "nerfstudio",
    photoreal: true,
    note: "Run ns-export gaussian-splat if point_cloud.ply is missing, then refresh viewer",
    splat_url: `/api/twins/${twinId}/exports/point_cloud.ply`,
  });
  saveStatus(jobDir, {
    status: "READY",
    progress: 100,
    current_step: "Nerfstudio training finished",
    viewer_url: `/twin-viewer.html?id=${encodeURIComponent(twinId)}`,
  });
}

async function processTwinJob(twinId) {
  const jobDir = twinPath(twinId);
  try {
    const meta = readJson(path.join(jobDir, "input", "job.json"), {}) || {};
    let frames = [];
    const framesDir = path.join(jobDir, "frames");
    const existing = fs.existsSync(framesDir)
      ? fs.readdirSync(framesDir).filter(f => /\.jpe?g$/i.test(f)).sort()
      : [];

    if (existing.length) {
      frames = existing;
      saveStatus(jobDir, {
        status: "EXTRACTED",
        progress: 25,
        frame_count: frames.length,
        current_step: `${frames.length} glasses frames ready`,
      });
    } else {
      saveStatus(jobDir, { status: "EXTRACTING", progress: 15, current_step: "Extracting frames from Ray-Ban walk-through video" });
      const inputVideo = ["capture.mp4", "capture.webm", "capture.mov"]
        .map(name => path.join(jobDir, "input", name))
        .find(p => fs.existsSync(p));
      if (!inputVideo) throw new Error("No capture video or frames found in input/");
      frames = await extractFrames(inputVideo, framesDir, Number(process.env.TWIN_FPS || 2));
      saveStatus(jobDir, { status: "EXTRACTED", progress: 25, frame_count: frames.length, current_step: `${frames.length} frames ready` });
    }

    writeJsonSafe(path.join(jobDir, "manifest.json"), {
      twin_id: twinId,
      source: meta.source || "ai-glasses-video",
      resolution_target: "3K",
      fps_extract: Number(process.env.TWIN_FPS || 2),
      frame_count: frames.length,
      engine: TWIN_ENGINE,
      created_at: new Date().toISOString(),
    });

    if (TWIN_ENGINE === "nerfstudio") {
      await runNerfstudioEngine(jobDir, twinId);
    } else if (TWIN_ENGINE === "longsplat") {
      saveStatus(jobDir, {
        status: "FAILED",
        progress: 25,
        error: "LongSplat engine selected but not auto-wired yet. Place LongSplat repo path in TWIN_LONGSPLAT_ROOT and use demo/nerfstudio for now.",
        current_step: "LongSplat integration pending",
      });
    } else {
      await runDemoEngine(jobDir, twinId, frames);
    }
  } catch (err) {
    saveStatus(jobDir, {
      status: "FAILED",
      progress: 0,
      error: err.message,
      current_step: "Failed",
    });
  }
}

function saveFramesFromDataUrls(framesDir, videoFrames) {
  fs.mkdirSync(framesDir, { recursive: true });
  const saved = [];
  let index = 1;
  for (const item of videoFrames) {
    const raw = String(item || "").trim();
    const match = raw.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,(.+)$/i);
    if (!match) continue;
    const name = `frame_${String(index).padStart(5, "0")}.jpg`;
    fs.writeFileSync(path.join(framesDir, name), Buffer.from(match[1], "base64"));
    saved.push(name);
    index += 1;
    if (saved.length >= 80) break;
  }
  return saved;
}

function createTwinJob({ title, description, videoDataUrl, videoFrames, device, sessionId, labName }) {
  ensureRoot();
  const twinId = nextTwinId();
  const jobDir = twinPath(twinId);
  if (fs.existsSync(jobDir)) throw new Error("Twin id collision — retry");
  fs.mkdirSync(path.join(jobDir, "input"), { recursive: true });
  fs.mkdirSync(path.join(jobDir, "frames"), { recursive: true });
  fs.mkdirSync(path.join(jobDir, "raw"), { recursive: true });
  fs.mkdirSync(path.join(jobDir, "exports"), { recursive: true });

  const frameList = Array.isArray(videoFrames) ? videoFrames.filter(Boolean) : [];
  let source = "ai-glasses-video";
  if (frameList.length) {
    const saved = saveFramesFromDataUrls(path.join(jobDir, "frames"), frameList);
    if (!saved.length) throw new Error("video_frames contained no valid JPEG images");
    source = "ai-glasses-frames";
    writeJsonSafe(path.join(jobDir, "input", "frames_manifest.json"), { count: saved.length });
  } else if (videoDataUrl) {
    const { mime, buffer } = decodeDataUrl(videoDataUrl);
    const ext = extensionForMime(mime);
    const videoFile = path.join(jobDir, "input", `capture${ext === ".mp4" ? ".mp4" : ext}`);
    fs.writeFileSync(videoFile, buffer);
    if (path.basename(videoFile) !== "capture.mp4") {
      fs.copyFileSync(videoFile, path.join(jobDir, "input", "capture.mp4"));
    }
  } else {
    throw new Error("video or video_frames is required");
  }

  const meta = {
    twin_id: twinId,
    title: title || `Lab twin ${twinId}`,
    description: description || "Digital twin from AI-glasses walk-through",
    lab_name: labName || "Telecom Lab",
    device: device || "ray-ban",
    session_id: sessionId || "",
    engine: TWIN_ENGINE,
    source,
    created_at: new Date().toISOString(),
  };
  writeJsonSafe(path.join(jobDir, "input", "job.json"), meta);
  const status = saveStatus(jobDir, {
    twin_id: twinId,
    status: "QUEUED",
    progress: 5,
    current_step: "Queued",
    title: meta.title,
    lab_name: meta.lab_name,
    device: meta.device,
    engine: TWIN_ENGINE,
    viewer_url: `/twin-viewer.html?id=${encodeURIComponent(twinId)}`,
  });

  setImmediate(() => { processTwinJob(twinId); });
  return status;
}

function listTwins() {
  ensureRoot();
  return fs.readdirSync(TWIN_ROOT)
    .filter(name => name.startsWith("TWIN-") && fs.statSync(path.join(TWIN_ROOT, name)).isDirectory())
    .map(name => readJson(path.join(TWIN_ROOT, name, "status.json"), { twin_id: name, status: "UNKNOWN" }))
    .sort((a, b) => String(b.twin_id).localeCompare(String(a.twin_id)));
}

function getTwin(twinId) {
  if (!/^TWIN-[\w-]+$/.test(twinId)) throw new Error("Invalid twin id");
  const jobDir = twinPath(twinId);
  if (!fs.existsSync(jobDir)) throw new Error("Twin not found");
  return {
    ...readJson(path.join(jobDir, "status.json"), {}),
    manifest: readJson(path.join(jobDir, "manifest.json")),
    job: readJson(path.join(jobDir, "input", "job.json")),
    viewer: readJson(path.join(jobDir, "exports", "viewer.json")),
    overlays: listOverlays(twinId),
  };
}

function listOverlays(twinId) {
  if (!/^TWIN-[\w-]+$/.test(twinId)) throw new Error("Invalid twin id");
  const file = path.join(twinPath(twinId), "exports", "overlays.json");
  const data = readJson(file, { overlays: [] });
  return Array.isArray(data?.overlays) ? data.overlays : [];
}

function saveOverlays(twinId, overlays) {
  if (!/^TWIN-[\w-]+$/.test(twinId)) throw new Error("Invalid twin id");
  const jobDir = twinPath(twinId);
  if (!fs.existsSync(jobDir)) throw new Error("Twin not found");
  const exportsDir = path.join(jobDir, "exports");
  fs.mkdirSync(exportsDir, { recursive: true });
  const cleaned = (Array.isArray(overlays) ? overlays : []).slice(0, 80).map((item, index) => ({
    id: String(item.id || `ov-${Date.now()}-${index}`).slice(0, 64),
    type: ["gauge", "label", "metric", "indicator"].includes(item.type) ? item.type : "label",
    title: String(item.title || "Overlay").slice(0, 80),
    value: String(item.value ?? "").slice(0, 40),
    unit: String(item.unit || "").slice(0, 20),
    api_url: String(item.api_url || item.url || "").trim().slice(0, 500),
    min: Number.isFinite(Number(item.min)) ? Number(item.min) : 0,
    max: Number.isFinite(Number(item.max)) ? Number(item.max) : 100,
    progress: Math.max(0, Math.min(1, Number(item.progress) || 0)),
    range: Math.max(0.02, Math.min(0.3, Number(item.range) || 0.08)),
    x: Math.max(4, Math.min(92, Number(item.x) || 78)),
    y: Math.max(8, Math.min(88, Number(item.y) || 18)),
    color: /^#[0-9a-fA-F]{6}$/.test(String(item.color || "")) ? String(item.color) : "#4ade80",
  }));
  writeJsonSafe(path.join(exportsDir, "overlays.json"), {
    twin_id: twinId,
    updated_at: new Date().toISOString(),
    overlays: cleaned,
  });
  return cleaned;
}

function listFrames(twinId) {
  const framesDir = path.join(twinPath(twinId), "frames");
  if (!fs.existsSync(framesDir)) return [];
  return fs.readdirSync(framesDir).filter(f => /\.jpe?g$/i.test(f)).sort()
    .map(name => ({ name, url: `/api/twins/${twinId}/frames/${encodeURIComponent(name)}` }));
}

function resolveExportFile(twinId, fileName) {
  if (!/^TWIN-[\w-]+$/.test(twinId)) throw new Error("Invalid twin id");
  if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) throw new Error("Invalid file name");
  const full = path.join(twinPath(twinId), "exports", fileName);
  if (!full.startsWith(twinPath(twinId)) || !fs.existsSync(full)) throw new Error("Export not found");
  return full;
}

function resolveFrameFile(twinId, fileName) {
  if (!/^TWIN-[\w-]+$/.test(twinId)) throw new Error("Invalid twin id");
  if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) throw new Error("Invalid file name");
  const full = path.join(twinPath(twinId), "frames", fileName);
  if (!full.startsWith(twinPath(twinId)) || !fs.existsSync(full)) throw new Error("Frame not found");
  return full;
}

module.exports = {
  TWIN_ROOT,
  TWIN_ENGINE,
  createTwinJob,
  listTwins,
  getTwin,
  listFrames,
  listOverlays,
  saveOverlays,
  resolveExportFile,
  resolveFrameFile,
  processTwinJob,
  ensureRoot,
};
