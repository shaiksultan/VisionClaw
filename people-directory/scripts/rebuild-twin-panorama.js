const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const twinId = process.argv[2] || "TWIN-20261001-161800";
const root = path.join(__dirname, "..");
const jobDir = path.join(root, "data", "lab-twins", twinId);
const framesDir = path.join(jobDir, "frames");
const exportsDir = path.join(jobDir, "exports");

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", d => { err += d.toString(); });
    child.on("error", reject);
    child.on("close", code => (code === 0 ? resolve() : reject(new Error(err.trim() || `${cmd} exit ${code}`))));
  });
}

async function buildPanorama(frames) {
  const n = frames.length;
  const w = 512;
  const h = 288;
  const outPath = path.join(exportsDir, "panorama.jpg");
  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  for (const name of frames) args.push("-i", path.join(framesDir, name));
  const scaled = frames
    .map((_, i) => `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`)
    .join(";");
  const stack = frames.map((_, i) => `[v${i}]`).join("");
  args.push("-filter_complex", `${scaled};${stack}hstack=inputs=${n}[out]`, "-map", "[out]", "-frames:v", "1", "-q:v", "3", outPath);
  await run("ffmpeg", args, framesDir);
  return outPath;
}

async function main() {
  if (!fs.existsSync(framesDir)) throw new Error(`Missing frames: ${framesDir}`);
  fs.mkdirSync(exportsDir, { recursive: true });
  const frames = fs.readdirSync(framesDir).filter(f => /\.jpe?g$/i.test(f)).sort();
  if (!frames.length) throw new Error("No frames");
  const pano = await buildPanorama(frames);
  const viewerPath = path.join(exportsDir, "viewer.json");
  const viewer = fs.existsSync(viewerPath) ? JSON.parse(fs.readFileSync(viewerPath, "utf8")) : {};
  Object.assign(viewer, {
    twin_id: twinId,
    format: "panorama+walkthrough",
    panorama_url: `/api/twins/${twinId}/exports/panorama.jpg`,
    splat_url: viewer.splat_url || `/api/twins/${twinId}/exports/point_cloud.ply`,
    frames_url: `/api/twins/${twinId}/frames`,
    video_url: viewer.video_url || `/api/twins/${twinId}/exports/walkthrough.mp4`,
    engine: "demo",
    photoreal: false,
    default_view: "3d",
    recommended_engine: "nerfstudio splatfacto or LongSplat (needs CUDA GPU)",
    note: "Continuous panoramic twin. Photoreal free-roam 3DGS needs CUDA GPU + TWIN_ENGINE=nerfstudio.",
  });
  fs.writeFileSync(viewerPath, `${JSON.stringify(viewer, null, 2)}\n`);
  console.log(`OK panorama ${twinId} frames=${frames.length} bytes=${fs.statSync(pano).size}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
