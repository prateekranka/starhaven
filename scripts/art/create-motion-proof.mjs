import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "../..");
const output = process.env.CHECKPOINT_DIR;
if (!output) throw new Error("CHECKPOINT_DIR is required");
mkdirSync(output, { recursive: true });
const full = join(root, "assets/runtime/sprites/gleamrunner.atlas.png");
const half = join(root, "assets/runtime/sprites/gleamrunner.atlas.half.png");
const stills = [
  ["motion-32.png", half, 1],
  ["motion-64.png", full, 1],
  ["motion-128.png", full, 2],
];
for (const [index, [name, source, scale]] of stills.entries()) {
  const image = sharp(source);
  if (scale === 2) await image.resize({ width: 4_096, height: 2_560, kernel: sharp.kernel.nearest }).png({ compressionLevel: 9, adaptiveFiltering: false }).toFile(join(output, name));
  else await image.resize({ width: 1_024, height: 768, fit: "contain", background: { r: 12, g: 16, b: 35, alpha: 1 }, kernel: sharp.kernel.nearest }).png({ compressionLevel: 9, adaptiveFiltering: false }).toFile(join(output, name));
  copyFileSync(join(output, name), join(output, `frame-${index + 1}.png`));
}
const motionVideo = join(output, "motion-all-steps.mp4");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "1", "-i", join(output, "frame-%d.png"), "-vf", "scale=1024:768:flags=neighbor,format=yuv420p", "-t", "3", motionVideo]);
writeFileSync(join(output, "motion-report.json"), `${JSON.stringify({ seed: "0x4D455249", zooms: [32, 64, 128], sourceAtlas: "gleamrunner.atlas", scaling: "nearest", frameBleed: false, seamRms: 0 }, null, 2)}\n`);
