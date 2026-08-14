import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import sharp from "sharp";
import { PNG_OPTS, repoPath } from "./config.mjs";

export function sheetRowForDirection(sources, direction) {
  const row = sources.directionRows[direction];
  if (row == null) throw new Error(`No sheet row for direction ${direction} in ${sources.id}`);
  return row;
}

async function extractStillPose({ sources, outPath }) {
  const cell = sources.cellSize;
  const meta = await sharp(repoPath(sources.still)).metadata();
  const w = meta.width || cell;
  const h = meta.height || cell;
  const left = Math.max(0, Math.min(w - cell, ((w - cell) / 2) | 0));
  const top = Math.max(0, h - cell - Math.max(0, ((h - cell) * 0.08) | 0));
  mkdirSync(dirname(outPath), { recursive: true });
  await sharp(repoPath(sources.still))
    .extract({ left, top, width: Math.min(cell, w - left), height: Math.min(cell, h - top) })
    .resize(cell, cell, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: sharp.kernel.nearest })
    .png(PNG_OPTS)
    .toFile(outPath);
  return outPath;
}

export async function extractPoseFrame({ sources, action, direction, pose, outPath }) {
  const clip = sources.clips[action];
  if (!clip) throw new Error(`Missing clip "${action}" in ${sources.id}`);
  const poseSpec = clip.poses[pose];
  if (!poseSpec) throw new Error(`Missing pose "${pose}" for clip "${action}" in ${sources.id}`);
  if (sources.mode === "still") {
    return extractStillPose({ sources, outPath });
  }
  const cell = sources.cellSize;
  const row = sheetRowForDirection(sources, direction);
  const col = poseSpec.col;
  mkdirSync(dirname(outPath), { recursive: true });
  await sharp(repoPath(sources.sheet))
    .extract({ left: col * cell, top: row * cell, width: cell, height: cell })
    .png(PNG_OPTS)
    .toFile(outPath);
  return outPath;
}
