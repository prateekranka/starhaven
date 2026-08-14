import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import sharp from "sharp";
import { PNG_OPTS, repoPath } from "./config.mjs";

export function sheetRowForDirection(sources, direction) {
  const row = sources.directionRows[direction];
  if (row == null) throw new Error(`No sheet row for direction ${direction} in ${sources.id}`);
  return row;
}

export async function extractPoseFrame({ sources, action, direction, pose, outPath }) {
  const clip = sources.clips[action];
  if (!clip) throw new Error(`Missing clip "${action}" in ${sources.id}`);
  const poseSpec = clip.poses[pose];
  if (!poseSpec) throw new Error(`Missing pose "${pose}" for clip "${action}" in ${sources.id}`);
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
