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

async function main() {
  if (!fs.existsSync(framesDir)) throw new Error(`Missing frames: ${framesDir}`);
  fs.mkdirSync(exportsDir, { recursive: true });
  const frames = fs.readdirSync(framesDir).filter(f => /\.jpe?g$/i.test(f)).sort();
  if (!frames.length) throw new Error("No frames");

  const holdSec = Math.max(0.08, Math.min(0.22, 8 / Math.max(frames.length, 1)));
  const listFile = path.join(exportsDir, "frames_concat.txt");
  const lines = [];
  for (const name of frames) {
    const abs = path.join(framesDir, name).replace(/\\/g, "/").replace(/'/g, "'\\''");
    lines.push(`file '${abs}'`);
    lines.push(`duration ${holdSec.toFixed(3)}`);
  }
  const last = path.join(framesDir, frames[frames.length - 1]).replace(/\\/g, "/").replace(/'/g, "'\\''");
  lines.push(`file '${last}'`);
  fs.writeFileSync(listFile, `${lines.join("\n")}\n`);

  const outPath = path.join(exportsDir, "walkthrough.mp4");
  try {
    await run("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", listFile,
      "-vf", "fps=30,format=yuv420p,minterpolate=fps=30:mi_mode=blend",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", outPath,
    ], exportsDir);
  } catch (err) {
    console.warn("minterpolate failed, fallback:", String(err.message || err).slice(0, 160));
    await run("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", listFile,
      "-vf", "fps=24,format=yuv420p",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", outPath,
    ], exportsDir);
  }

  const viewer = {
    twin_id: twinId,
    format: "pointcloud+walkthrough",
    video_url: `/api/twins/${twinId}/exports/walkthrough.mp4`,
    splat_url: `/api/twins/${twinId}/exports/point_cloud.ply`,
    frames_url: `/api/twins/${twinId}/frames`,
    engine: "demo",
    photoreal: false,
    show_photo_orbit: true,
    default_view: "3d",
    recommended_engine: "nerfstudio splatfacto or LongSplat",
    note: "3D point-cloud explore + faster walkthrough video.",
  };
  fs.writeFileSync(path.join(exportsDir, "viewer.json"), `${JSON.stringify(viewer, null, 2)}\n`);

  const statusPath = path.join(jobDir, "status.json");
  if (fs.existsSync(statusPath)) {
    const st = JSON.parse(fs.readFileSync(statusPath, "utf8"));
    st.current_step = "3D twin + faster walkthrough ready";
    fs.writeFileSync(statusPath, `${JSON.stringify(st, null, 2)}\n`);
  }

  console.log(`OK ${twinId} frames=${frames.length} hold=${holdSec.toFixed(3)}s bytes=${fs.statSync(outPath).size}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
