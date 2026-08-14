import sharp from "sharp";
import { PNG_OPTS } from "./config.mjs";

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function colorDist(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function nearestPalette(rgb, palette) {
  const colors = palette.colors.map(hexToRgb);
  let best = colors[0];
  let bestD = Infinity;
  for (const c of colors) {
    const d = colorDist(rgb, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export async function cleanupToPalette(inputPath, palette, { alphaThreshold = 32 } = {}) {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < info.width * info.height; i += 1) {
    const o = i * 4;
    const a = out[o + 3];
    if (a < alphaThreshold) {
      out[o + 3] = 0;
      continue;
    }
    const rgb = nearestPalette([out[o], out[o + 1], out[o + 2]], palette);
    out[o] = rgb[0];
    out[o + 1] = rgb[1];
    out[o + 2] = rgb[2];
    out[o + 3] = 255;
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png(PNG_OPTS).toFile(inputPath);
  return inputPath;
}

export async function cleanupTree(records, palette) {
  for (const rec of records) {
    await cleanupToPalette(rec.file, palette);
  }
}
