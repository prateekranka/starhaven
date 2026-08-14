import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import sharp from "sharp";
import { MIRROR_SOURCE, PNG_OPTS, SOURCE_DIRECTIONS } from "./config.mjs";

const POSES = ["A", "B"];

export function sunGuardSvg(action, direction, pose, palette) {
  const body = 28;
  const lift = pose === "B" ? (action === "attack" ? -8 : action === "death" ? 6 : -2) : 0;
  const lean = direction.includes("E") ? 3 : direction.includes("W") ? -3 : 0;
  const accent = palette.colors[action === "attack" ? 1 : action === "death" ? 4 : 0];
  const weapon =
    action === "attack"
      ? `<path fill="${palette.colors[2]}" d="M${78 + lean} 52 L${92 + lean} 38 L${96 + lean} 42 L${82 + lean} 56 Z"/>`
      : action === "death"
        ? `<path fill="${palette.colors[4]}" d="M${48 + lean} 88 L${80 + lean} 92 L${78 + lean} 98 L${46 + lean} 94 Z"/>`
        : `<path fill="${palette.colors[2]}" d="M${72 + lean} 58 H${84 + lean} V${72 + lean} H${72 + lean} Z"/>`;
  const token = "M64 24 L73 33 L64 42 L55 33 Z";
  const shadow = action === "death" ? `<ellipse cx="64" cy="118" rx="22" ry="5" fill="${palette.colors[5]}" opacity="0.35"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" shape-rendering="crispEdges"><g transform="translate(${lean} ${lift})">${shadow}<path fill="${palette.colors[5]}" d="M64 ${15 + body / 3} L${64 - body} 58 L${64 - body + 8} 102 L64 112 L${64 + body - 8} 102 L${64 + body} 58 Z"/><path fill="${palette.colors[0]}" d="M64 34 L${64 - body + 7} 60 L${64 - body + 11} 96 L64 106 L${64 + body - 11} 96 L${64 + body - 7} 60 Z"/><path fill="${accent}" d="${token}"/><path fill="${palette.colors[3]}" d="M52 58 H76 V74 H52 Z"/><path fill="${palette.colors[4]}" d="M46 98 H58 V110 H46 Z M70 98 H82 V110 H70 Z"/>${weapon}</g></svg>`;
}

export async function generateUnitSources({ unitId, faction, clips, palette, sourceRoot }) {
  const records = [];
  for (const action of clips) {
    for (const direction of SOURCE_DIRECTIONS) {
      for (const pose of POSES) {
        const file = `${sourceRoot}/units/${faction}/${unitId}/${action}/${direction}/${pose}.png`;
        mkdirSync(dirname(file), { recursive: true });
        const svg = sunGuardSvg(action, direction, pose, palette);
        await sharp(Buffer.from(svg)).png(PNG_OPTS).toFile(file);
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
  return `${sourceRoot}/units/${faction}/${unitId}/${action}/${sourceDirection}/${pose}.png`;
}

export function frameNeedsMirror(direction) {
  return Boolean(MIRROR_SOURCE[direction]);
}
