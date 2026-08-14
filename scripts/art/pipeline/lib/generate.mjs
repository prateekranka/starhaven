import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { MIRROR_SOURCE, SOURCE_DIRECTIONS } from "./config.mjs";
import { extractPoseFrame } from "./extract-source.mjs";

const POSES = ["A", "B"];

export async function generateUnitSources({ unitId, faction, clips, sourceRoot, sources }) {
  const records = [];
  for (const action of clips) {
    for (const direction of SOURCE_DIRECTIONS) {
      for (const pose of POSES) {
        const file = join(sourceRoot, "units", faction, unitId, action, direction, `${pose}.png`);
        mkdirSync(dirname(file), { recursive: true });
        await extractPoseFrame({ sources, action, direction, pose, outPath: file });
        records.push({ file, action, direction, pose });
      }
    }
  }
  return records;
}

export function resolveSourcePath(sourceRoot, faction, unitId, action, direction, framePattern, frameIndex) {
  const token = framePattern[frameIndex];
  const pose = token.startsWith("A") ? "A" : "B";
  const sourceDirection = MIRROR_SOURCE[direction] ?? direction;
  return join(sourceRoot, "units", faction, unitId, action, sourceDirection, `${pose}.png`);
}

export function frameNeedsMirror(direction) {
  return Boolean(MIRROR_SOURCE[direction]);
}
