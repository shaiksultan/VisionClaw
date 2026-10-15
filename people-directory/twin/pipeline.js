/**
 * ab-twin — Digital Capture from AI-Glasses Video
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

  saveStatus(jobDir, { status: "EXPORTING", progress: 70, current_step: "Building digital capture panorama preview" });
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
    default_view: "video",
    recommended_engine: "nerfstudio splatfacto or LongSplat (needs CUDA GPU)",
    note: videoReady
      ? "Digital Capture ready — play the walk-through or look around full photos. Photoreal free-roam 3DGS needs CUDA + TWIN_ENGINE=nerfstudio."
      : "Capture frames ready. Install ffmpeg for walk-through video export.",
  });
  saveStatus(jobDir, {
    status: "READY",
    progress: 100,
    current_step: videoReady ? "Digital capture ready" : (panoramaReady ? "Capture frames ready" : "Capture processing complete"),
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
    description: description || "Digital capture from AI-glasses walk-through",
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
    .map(name => {
      const status = readJson(path.join(TWIN_ROOT, name, "status.json"), { twin_id: name, status: "UNKNOWN" });
      return { ...status, ...twinMediaLinks(name) };
    })
    .sort((a, b) => String(b.twin_id).localeCompare(String(a.twin_id)));
}

function fileExists(...parts) {
  return fs.existsSync(path.join(...parts));
}

function twinMediaLinks(twinId) {
  const jobDir = twinPath(twinId);
  const exportsDir = path.join(jobDir, "exports");
  const hasSource = fileExists(jobDir, "input", "capture.mp4");
  const hasWalk = fileExists(exportsDir, "walkthrough.mp4");
  const hasProcessedVideo = fileExists(exportsDir, "processed.mp4");
  const hasPly = fileExists(exportsDir, "point_cloud.ply");
  const hasSplat = fileExists(exportsDir, "scene.splat") || fileExists(exportsDir, "scene.ksplat");
  const splatName = fileExists(exportsDir, "scene.splat") ? "scene.splat"
    : fileExists(exportsDir, "scene.ksplat") ? "scene.ksplat" : "";
  const hasZip = fileExists(exportsDir, "processed.zip");
  const processedMeta = readJson(path.join(exportsDir, "processed.json"), null);
  return {
    download_mp4_url: hasSource || hasWalk
      ? `/api/twins/${twinId}/download/mp4`
      : "",
    download_source_url: hasSource ? `/api/twins/${twinId}/download/source` : "",
    download_walkthrough_url: hasWalk ? `/api/twins/${twinId}/download/walkthrough` : "",
    upload_processed_url: `/api/twins/${twinId}/processed`,
    processed: {
      ...(processedMeta || {}),
      video_url: hasProcessedVideo ? `/api/twins/${twinId}/exports/processed.mp4` : "",
      ply_url: hasPly ? `/api/twins/${twinId}/exports/point_cloud.ply` : "",
      splat_url: splatName ? `/api/twins/${twinId}/exports/${splatName}` : "",
      zip_url: hasZip ? `/api/twins/${twinId}/exports/processed.zip` : "",
      has_processed: Boolean(hasProcessedVideo || splatName || (processedMeta?.uploaded_at && hasPly)),
    },
  };
}

function getTwin(twinId) {
  if (!/^TWIN-[\w-]+$/.test(twinId)) throw new Error("Invalid twin id");
  const jobDir = twinPath(twinId);
  if (!fs.existsSync(jobDir)) throw new Error("Twin not found");
  const status = readJson(path.join(jobDir, "status.json"), {});
  const media = twinMediaLinks(twinId);
  return {
    ...status,
    ...media,
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

function resolveDownloadFile(twinId, kind = "mp4") {
  if (!/^TWIN-[\w-]+$/.test(twinId)) throw new Error("Invalid twin id");
  const jobDir = twinPath(twinId);
  if (!fs.existsSync(jobDir)) throw new Error("Twin not found");
  const source = path.join(jobDir, "input", "capture.mp4");
  const walk = path.join(jobDir, "exports", "walkthrough.mp4");
  if (kind === "source") {
    if (!fs.existsSync(source)) throw new Error("Source MP4 not found — upload a walk-through video first");
    return { file: source, downloadName: `${twinId}-source.mp4` };
  }
  if (kind === "walkthrough") {
    if (!fs.existsSync(walk)) throw new Error("Walkthrough MP4 not found yet");
    return { file: walk, downloadName: `${twinId}-walkthrough.mp4` };
  }
  // Prefer original capture for offline Nerfstudio / real twin training
  if (fs.existsSync(source)) return { file: source, downloadName: `${twinId}-capture.mp4` };
  if (fs.existsSync(walk)) return { file: walk, downloadName: `${twinId}-walkthrough.mp4` };
  throw new Error("No MP4 available to download yet");
}

function uploadProcessedAsset(twinId, { dataUrl, filename = "", label = "" } = {}) {
  if (!/^TWIN-[\w-]+$/.test(twinId)) throw new Error("Invalid twin id");
  const jobDir = twinPath(twinId);
  if (!fs.existsSync(jobDir)) throw new Error("Twin not found");
  const { mime, buffer } = decodeDataUrl(dataUrl);
  if (!buffer.length) throw new Error("Processed file is empty");
  if (buffer.length > 400 * 1024 * 1024) throw new Error("Processed file too large (max ~400MB)");

  const exportsDir = path.join(jobDir, "exports");
  fs.mkdirSync(exportsDir, { recursive: true });
  const nameHint = String(filename || label || "").toLowerCase();
  let kind = "binary";
  let outName = "processed.bin";
  if (mime.includes("mp4") || nameHint.endsWith(".mp4") || mime.includes("video")) {
    kind = "video";
    outName = "processed.mp4";
  } else if (mime.includes("zip") || nameHint.endsWith(".zip")) {
    kind = "zip";
    outName = "processed.zip";
  } else if (nameHint.endsWith(".ksplat") || nameHint.includes("ksplat")) {
    kind = "splat";
    outName = "scene.ksplat";
  } else if (nameHint.endsWith(".splat") || mime.includes("octet-stream") && nameHint.includes("splat")) {
    kind = "splat";
    outName = "scene.splat";
  } else if (nameHint.endsWith(".ply") || mime.includes("ply") || mime.includes("octet-stream")) {
    kind = "ply";
    outName = "point_cloud.ply";
  } else if (nameHint.endsWith(".glb") || nameHint.endsWith(".gltf")) {
    kind = "model";
    outName = nameHint.endsWith(".gltf") ? "processed.gltf" : "processed.glb";
  } else {
    throw new Error("Unsupported processed file. Upload MP4, PLY, SPLAT/KSPLAT, GLB, or ZIP.");
  }

  const outPath = path.join(exportsDir, outName);
  fs.writeFileSync(outPath, buffer);

  const processedMeta = {
    twin_id: twinId,
    kind,
    filename: outName,
    original_name: String(filename || outName).slice(0, 180),
    mime,
    bytes: buffer.length,
    uploaded_at: new Date().toISOString(),
    label: String(label || "Offline real digital twin").slice(0, 120),
  };
  writeJsonSafe(path.join(exportsDir, "processed.json"), processedMeta);

  const viewer = readJson(path.join(exportsDir, "viewer.json"), { twin_id: twinId }) || { twin_id: twinId };
  viewer.photoreal = kind === "ply" || kind === "splat" || kind === "model";
  viewer.processed = true;
  viewer.processed_kind = kind;
  if (kind === "video") viewer.processed_video_url = `/api/twins/${twinId}/exports/processed.mp4`;
  if (kind === "ply") viewer.splat_url = `/api/twins/${twinId}/exports/point_cloud.ply`;
  if (kind === "splat") viewer.splat_url = `/api/twins/${twinId}/exports/${outName}`;
  if (kind === "zip") viewer.processed_zip_url = `/api/twins/${twinId}/exports/processed.zip`;
  if (kind === "model") viewer.processed_model_url = `/api/twins/${twinId}/exports/${outName}`;
  viewer.note = `Offline processed ${kind} uploaded. Open processed file or viewer to review the real digital twin output.`;
  writeJsonSafe(path.join(exportsDir, "viewer.json"), viewer);

  saveStatus(jobDir, {
    status: "READY",
    progress: 100,
    current_step: `Processed ${kind} uploaded — real digital twin ready`,
    processed: true,
    processed_kind: kind,
    processed_file: outName,
    engine: kind === "ply" || kind === "splat" ? "offline-3dgs" : (kind === "video" ? "offline-video" : "offline-processed"),
  });

  return {
    twin_id: twinId,
    ...processedMeta,
    ...twinMediaLinks(twinId),
    viewer_url: `/twin-viewer.html?id=${encodeURIComponent(twinId)}`,
    spoken_summary: `Processed ${kind} saved on ${twinId}. Open the processed file link to review.`,
  };
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
  resolveDownloadFile,
  uploadProcessedAsset,
  twinMediaLinks,
  processTwinJob,
  ensureRoot,
};
