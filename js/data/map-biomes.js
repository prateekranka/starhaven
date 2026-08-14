/** Terrain/biome palette for declarative maps (void = space rim, not ocean). */

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

export const BIOME_RGB = {
  sand: [243, 215, 160],
  dirt: [212, 164, 92],
  grass: [122, 154, 74],
  rock: [165, 106, 66],
  cliff: [106, 64, 48],
  void: [18, 24, 40],
};

export const BIOME_HEX = {
  sand: "#f3d7a0",
  dirt: "#d4a45c",
  grass: "#7a9a4a",
  rock: "#a56a42",
  cliff: "#6a4030",
  void: "#121828",
};

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
  return BIOME_RGB[biomeNameFromChar(BIOME_CHAR[idx] ?? "s")];
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
      const fill = override ?? `rgb(${BIOME_RGB[biomeNameFromChar(ch)].join(",")})`;
      rects += `<rect x="${x * px}" y="${z * px}" width="${px}" height="${px}" fill="${fill}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size * px} ${size * px}" width="${size * px}" height="${size * px}">${rects}</svg>\n`;
}
