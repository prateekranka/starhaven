import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import sharp from "sharp";
import { DIRECTIONS, MIRROR_SOURCE, PNG_OPTS } from "./config.mjs";
import { frameNeedsMirror, resolveSourcePath } from "./generate.mjs";

export async function packUnitAtlas({ unitId, faction, clips, spec, inbetweening, sourceRoot, atlasPath, metaPath }) {
  const cell = spec.frameSize.width;
  const width = DIRECTIONS.length * spec.atlas.columnsPerDirection * cell;
  const height = clips.length * 2 * cell;
  const composites = [];
  const frames = [];
  const durations = Object.fromEntries(Object.entries(spec.clips).map(([k, v]) => [k, v.durationMs]));

  for (let actionIndex = 0; actionIndex < clips.length; actionIndex += 1) {
    const action = clips[actionIndex];
    const pattern = inbetweening.patterns[action];
    if (!pattern) throw new Error(`Missing inbetweening pattern for ${action}`);
    for (let directionIndex = 0; directionIndex < DIRECTIONS.length; directionIndex += 1) {
      const direction = DIRECTIONS[directionIndex];
      for (let frame = 0; frame < pattern.length; frame += 1) {
        const source = resolveSourcePath(sourceRoot, faction, unitId, action, direction, pattern, frame);
        let image = sharp(source).resize(cell, cell, { fit: "fill", kernel: sharp.kernel.nearest });
        if (frameNeedsMirror(direction)) image = image.flop();
        composites.push({
          input: await image.png(PNG_OPTS).toBuffer(),
          left: (directionIndex * 2 + frame % 2) * cell,
          top: (actionIndex * 2 + Math.floor(frame / 2)) * cell,
        });
        frames.push({
          id: `${unitId}.${action}.${direction}.${frame}`,
          action,
          facing: direction,
          frame,
          durationMs: durations[action] ?? 110,
          pivot: { ...spec.pivot },
          mirrored: Boolean(MIRROR_SOURCE[direction]),
          col: directionIndex * 2 + (frame % 2),
          row: actionIndex * 2 + Math.floor(frame / 2),
        });
      }
    }
  }

  mkdirSync(dirname(atlasPath), { recursive: true });
  await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png(PNG_OPTS)
    .toFile(atlasPath);

  const bytes = readFileSync(atlasPath);
  const meta = {
    version: "unit-atlas.v1",
    id: unitId,
    faction,
    path: "media/sprites/" + atlasPath.split("/").pop(),
    width,
    height,
    cell,
    cols: width / cell,
    rows: height / cell,
    clips: clips.map((c) => ({ id: c, ...spec.clips[c] })),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    frames,
  };
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}
