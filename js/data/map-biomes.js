/** Terrain/biome palette for declarative maps (void = space rim, not ocean). */

import { getBiomeRgb } from "../config/map-config.js";

// Keep the historical exports stable while the presentation palette lives in
// the config module. The index, character, and parser contracts remain local.
export { BIOME_RGB, BIOME_HEX } from "../config/map-config.js";

export const BIOME = {
  sand: 0,
  dirt: 1,
  grass: 2,
  rock: 3,
  cliff: 4,
  void: 5,
};

export const BIOME_CHAR = ["s", "d", "g", "r", "c", "v"];

export const BIOME_FROM_CHAR = Object.fromEntries(BIOME_CHAR.map((ch, i) => [ch, i]));

export function biomeIndexFromChar(ch) {
  const idx = BIOME_FROM_CHAR[ch];
  return idx == null ? BIOME.sand : idx;
}

export function biomeCharFromIndex(idx) {
  return BIOME_CHAR[idx] ?? "s";
}

export function biomeNameFromChar(ch) {
  const idx = BIOME_FROM_CHAR[ch];
  return idx == null ? "sand" : Object.keys(BIOME)[idx];
}

export function biomeRgb(idx) {
  return getBiomeRgb(biomeNameFromChar(BIOME_CHAR[idx] ?? "s"));
}

export function parseTerrainLayer(raw, size) {
  const expect = size * size;
  if (typeof raw !== "string" || raw.length !== expect) {
    throw new Error(`terrain layer must be ${expect} chars`);
  }
  const out = new Uint8Array(expect);
  for (let i = 0; i < expect; i += 1) out[i] = biomeIndexFromChar(raw[i]);
  return out;
}

export function parseWalkLayer(raw, size) {
  const expect = size * size;
  if (typeof raw !== "string" || raw.length !== expect) {
    throw new Error(`walk layer must be ${expect} chars`);
  }
  const out = new Uint8Array(expect);
  for (let i = 0; i < expect; i += 1) out[i] = raw[i] === "1" ? 1 : 0;
  return out;
}

export function terrainSvg(terrainStr, size, px, fillOverrides = {}) {
  let rects = "";
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const ch = terrainStr[z * size + x];
      const override = fillOverrides[ch];
      const fill = override ?? `rgb(${biomeRgb(BIOME_FROM_CHAR[ch]).join(",")})`;
      rects += `<rect x="${x * px}" y="${z * px}" width="${px}" height="${px}" fill="${fill}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size * px} ${size * px}" width="${size * px}" height="${size * px}">${rects}</svg>\n`;
}
