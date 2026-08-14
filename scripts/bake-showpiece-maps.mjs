#!/usr/bin/env node
/** Bake three 96×96 showpiece skirmish maps + SVG previews. */

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BIOME, biomeCharFromIndex, BIOME_RGB } from "../js/data/map-biomes.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SIZE = 96;
const CELL = 2;
const CHAR = (b) => biomeCharFromIndex(b);

const START_NODES = [
  ["food", 5, 1],
  ["food", 6, 1],
  ["food", 5, 2],
  ["food", 6, 2],
  ["wood", -2, 5],
  ["wood", -1, 5],
  ["wood", -2, 6],
  ["crystal", 5, -2],
  ["crystal", 6, -2],
  ["ore", -3, -1],
];

function fill(size, fn) {
  const terrain = new Uint8Array(size * size);
  const walk = new Uint8Array(size * size);
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = z * size + x;
      const b = fn(x, z, size);
      terrain[i] = b;
      walk[i] = b === BIOME.void || b === BIOME.cliff ? 0 : 1;
    }
  }
  return { terrain, walk };
}

function toLayers(terrain, walk) {
  let terrainStr = "";
  let walkStr = "";
  for (let i = 0; i < terrain.length; i += 1) {
    terrainStr += CHAR(terrain[i]);
    walkStr += walk[i] ? "1" : "0";
  }
  return { terrain: terrainStr, walk: walkStr };
}

function carvePath(terrain, walk, size, points) {
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    let x = x0;
    let z = z0;
    while (x !== x1 || z !== z1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
          const idx = nz * size + nx;
          walk[idx] = 1;
          if (terrain[idx] === BIOME.void || terrain[idx] === BIOME.cliff) terrain[idx] = BIOME.dirt;
        }
      }
      if (x < x1) x += 1;
      else if (x > x1) x -= 1;
      if (z < z1) z += 1;
      else if (z > z1) z -= 1;
    }
  }
}

function buildVoidRiftCrossing() {
  const { terrain, walk } = fill(SIZE, (x, z, n) => {
    const rim = Math.min(x, z, n - 1 - x, n - 1 - z);
    if (rim < 5) return BIOME.void;
    const band = Math.abs(x - z) < 4 || Math.abs(x + z - (n - 1)) < 4;
    if (band) return BIOME.void;
    const bridgeA = Math.abs(x - 30) < 2 && z > 40 && z < 70;
    const bridgeB = Math.abs(x - 65) < 2 && z > 25 && z < 55;
    if (bridgeA || bridgeB) return BIOME.dirt;
    if (rim < 9) return BIOME.cliff;
    return (x + z) % 11 < 4 ? BIOME.grass : BIOME.sand;
  });
  carvePath(terrain, walk, SIZE, [[12, 84], [30, 70], [48, 48], [65, 30], [84, 12]]);
  return toLayers(terrain, walk);
}

function buildHighlandChokes() {
  const { terrain, walk } = fill(SIZE, (x, z, n) => {
    const rim = Math.min(x, z, n - 1 - x, n - 1 - z);
    if (rim < 5) return BIOME.void;
    const ridge = Math.abs(x - 48) < 3 && z > 20 && z < 76;
    const chokeL = x > 40 && x < 56 && (Math.abs(z - 32) < 3 || Math.abs(z - 64) < 3);
    if (ridge && !chokeL) return BIOME.cliff;
    if (chokeL) return BIOME.rock;
    if (z < 34 || z > 62) return BIOME.grass;
    return BIOME.dirt;
  });
  return toLayers(terrain, walk);
}

function buildCrystalBasin() {
  const { terrain, walk } = fill(SIZE, (x, z, n) => {
    const rim = Math.min(x, z, n - 1 - x, n - 1 - z);
    if (rim < 5) return BIOME.void;
    const cx = x - 48;
    const cz = z - 48;
    const bowl = cx * cx + cz * cz;
    if (bowl < 400) return BIOME.rock;
    if (bowl < 650) return BIOME.dirt;
    if (rim < 10) return BIOME.cliff;
    return BIOME.sand;
  });
  return toLayers(terrain, walk);
}

function startResources(cx, cz, ecx, ecz) {
  const resources = [];
  for (const [kind, dx, dz] of START_NODES) {
    const amount = kind === "food" ? 140 : kind === "wood" ? 160 : 90;
    resources.push({ kind, cx: Math.max(2, Math.min(SIZE - 3, cx + dx)), cz: Math.max(2, Math.min(SIZE - 3, cz + dz)), amount });
    resources.push({ kind, cx: Math.max(2, Math.min(SIZE - 3, ecx - dx)), cz: Math.max(2, Math.min(SIZE - 3, ecz - dz)), amount });
  }
  return resources;
}

const maps = [
  {
    id: "void-rift-crossing",
    name: "Void Rift Crossing",
    blurb: "A diagonal void rift splits the mesa — only two narrow crossings join the halves.",
    preview: "media/maps/void-rift-crossing.svg",
    build: buildVoidRiftCrossing,
    starts: { player: { cx: 12, cz: 84, reveal: 16 }, enemy: { cx: 84, cz: 12, reveal: 12 } },
  },
  {
    id: "highland-chokes",
    name: "Highland Chokes",
    blurb: "Central cliff spine with twin chokes — high ground rewards map control, not water.",
    preview: "media/maps/highland-chokes.svg",
    build: buildHighlandChokes,
    starts: { player: { cx: 14, cz: 82, reveal: 16 }, enemy: { cx: 82, cz: 14, reveal: 12 } },
  },
  {
    id: "crystal-basin",
    name: "Crystal Basin",
    blurb: "A glittering crystal bowl at the heart — rich nodes, open flanks, void rim.",
    preview: "media/maps/crystal-basin.svg",
    build: buildCrystalBasin,
    starts: { player: { cx: 12, cz: 84, reveal: 16 }, enemy: { cx: 84, cz: 12, reveal: 12 } },
  },
];

function writeSvg(terrainStr) {
  const px = 3;
  const n = SIZE;
  let rects = "";
  for (let z = 0; z < n; z += 1) {
    for (let x = 0; x < n; x += 1) {
      const ch = terrainStr[z * n + x];
      const biome = { s: "sand", d: "dirt", g: "grass", r: "rock", c: "cliff", v: "void" }[ch] || "sand";
      const [r, g, b] = BIOME_RGB[biome];
      rects += `<rect x="${x * px}" y="${z * px}" width="${px}" height="${px}" fill="rgb(${r},${g},${b})"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n * px} ${n * px}" width="${n * px}" height="${n * px}">${rects}</svg>\n`;
}

mkdirSync(join(root, "maps"), { recursive: true });
mkdirSync(join(root, "media/maps"), { recursive: true });

for (const spec of maps) {
  const layers = spec.build();
  const ps = spec.starts.player;
  const es = spec.starts.enemy;
  const map = {
    schema: 1,
    id: spec.id,
    name: spec.name,
    size: SIZE,
    cell: CELL,
    terrain: layers.terrain,
    walk: layers.walk,
    starts: spec.starts,
    startNodes: START_NODES,
    relic: { cx: 48, cz: 48 },
    resources: startResources(ps.cx, ps.cz, es.cx, es.cz),
    props: [],
  };
  writeFileSync(join(root, "maps", `${spec.id}.json`), `${JSON.stringify(map)}\n`);
  writeFileSync(join(root, "media/maps", `${spec.id}.svg`), writeSvg(layers.terrain));
  console.log(`Wrote ${spec.id}.json + preview`);
}

for (const extra of ["bright-mesa", "training-flat"]) {
  const raw = JSON.parse(readFileSync(join(root, "maps", `${extra}.json`), "utf8"));
  writeFileSync(join(root, "media/maps", `${extra}.svg`), writeSvg(raw.terrain));
  console.log(`Wrote preview for ${extra}`);
}
