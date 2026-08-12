import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = join(root, "assets", "source");
const runtimeRoot = join(root, "assets", "runtime");
const publicRoot = join(root, "public", "game-assets");
const provenance = readJson(join(root, "assets", "provenance", "assets.json"));
const manifest = readJson(join(runtimeRoot, "runtime-manifest.json"));
const failures = [];
const expectedPalettes = {
  sunwoven: ["#F8D66D", "#E9825B", "#43C6B8", "#FFF0B5", "#3A3150", "#15182A"],
  gravemark: ["#778197", "#3E465A", "#C24B8E", "#B7C0D0", "#25283A", "#15182A"],
  meridian: ["#55E6F2", "#8C63FF"],
  world: ["#F8D66D", "#E9825B", "#43C6B8", "#FFF0B5", "#778197", "#3E465A", "#C24B8E", "#B7C0D0", "#55E6F2", "#8C63FF", "#3A3150", "#15182A"],
};

for (const [name, colors] of Object.entries(expectedPalettes)) {
  const palette = readJson(join(root, "assets", "palettes", `${name}.v1.json`));
  if (JSON.stringify(palette.colors) !== JSON.stringify(colors) || palette.dither !== 0) failures.push(`palette ${name} does not match the locked no-dither colors`);
}

if (provenance.sourceCount !== 330 || provenance.sources.length !== 330) failures.push("provenance source count is not 330");
if (new Set(provenance.sources.map((source) => source.path)).size !== provenance.sources.length) failures.push("provenance has duplicate source paths");
if (manifest.sourceCount !== 330 || manifest.atlases.length !== 6) failures.push("runtime manifest has an unexpected source or atlas count");
if (sharp.versions.vips !== "8.17.1") failures.push(`libvips is ${sharp.versions.vips}, expected 8.17.1`);

for (const source of provenance.sources) {
  const file = join(root, source.path);
  if (!existsSync(file)) {
    failures.push(`missing source ${source.path}`);
    continue;
  }
  const bytes = readFileSync(file);
  if (bytes.length !== source.bytes || sha256(bytes) !== source.sha256) failures.push(`source hash mismatch ${source.path}`);
  if (source.type === "unit-source" && (source.pivot?.x !== 64 || source.pivot?.y !== 112)) failures.push(`pivot mismatch ${source.path}`);
}

for (const output of provenance.runtimeOutputs) {
  const file = join(root, output.path);
  if (!existsSync(file)) failures.push(`missing runtime output ${output.path}`);
  else if (sha256(readFileSync(file)) !== output.sha256) failures.push(`runtime output hash mismatch ${output.path}`);
}

for (const atlas of manifest.atlases) {
  const expectedHeight = atlas.frames.some((frame) => frame.action === "build") ? 1_536 : 1_280;
  if (atlas.width !== 2_048 || atlas.height !== expectedHeight || atlas.width > 2_048 || atlas.height > 1_536) failures.push(`atlas dimension mismatch ${atlas.id}`);
  const expectedFrames = expectedHeight === 1_536 ? 192 : 160;
  if (atlas.frames.length !== expectedFrames) failures.push(`frame count mismatch ${atlas.id}`);
  for (const frame of atlas.frames) {
    if (frame.pivot.x !== 64 || frame.pivot.y !== 112) failures.push(`pivot mismatch ${frame.id}`);
    if (!["N", "NE", "E", "SE", "S", "SW", "W", "NW"].includes(frame.facing)) failures.push(`facing mismatch ${frame.id}`);
  }
  const full = join(root, "assets", "runtime", "sprites", `${atlas.id}.atlas.png`);
  const half = join(root, "assets", "runtime", "sprites", `${atlas.id}.atlas.half.png`);
  const publicFull = join(publicRoot, "sprites", `${atlas.id}.atlas.png`);
  const publicHalf = join(publicRoot, "sprites", `${atlas.id}.atlas.half.png`);
  for (const [runtimeFile, publicFile] of [[full, publicFull], [half, publicHalf]]) {
    if (!existsSync(runtimeFile) || !existsSync(publicFile)) failures.push(`missing public/runtime binding for ${atlas.id}`);
    else if (!readFileSync(runtimeFile).equals(readFileSync(publicFile))) failures.push(`public/runtime byte mismatch for ${atlas.id}`);
  }
}

const environmentEdgeRms = await checkSeam(join(sourceRoot, "textures", "terrain-grass.png"));
if (environmentEdgeRms > 6) failures.push(`seam RMS ${environmentEdgeRms} exceeds 6/255`);
const report = { valid: failures.length === 0, sourceCount: provenance.sources.length, atlasCount: manifest.atlases.length, libvips: sharp.versions.vips, maxTextureSize: manifest.maxTextureSize, seamRms: environmentEdgeRms, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;

function readJson(file) { return JSON.parse(readFileSync(file, "utf8")); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

async function checkSeam(file) {
  const image = sharp(file);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  let squared = 0;
  let samples = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      const left = data[(y * info.width * info.channels) + channel] ?? 0;
      const right = data[(y * info.width * info.channels) + ((info.width - 1) * info.channels) + channel] ?? 0;
      const delta = left - right;
      squared += delta * delta;
      samples += 1;
    }
  }
  return Math.sqrt(squared / Math.max(1, samples)) / 255;
}
