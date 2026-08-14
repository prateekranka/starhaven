/** Seeded skirmish map generator — void rims, mesa/verdant/crystal biomes, fair mirrored starts. */

import { BIOME, biomeCharFromIndex, parseWalkLayer } from "../data/map-biomes.js";
import { DeterministicPrng } from "./prng.js";
import { idx, astar } from "./path.js";

const CHAR = {
  [BIOME.sand]: "s",
  [BIOME.dirt]: "d",
  [BIOME.grass]: "g",
  [BIOME.rock]: "r",
  [BIOME.cliff]: "c",
  [BIOME.void]: "v",
};

const DEFAULT_START_NODES = [
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

function hashNoise(x, z, seed) {
  const s = Math.imul(x * 374761 + z * 668265 + seed * 982451, 1) >>> 0;
  return ((s ^ (s >>> 13)) * 1274126177) >>> 0;
}

function fbm(x, z, seed, oct = 4) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i += 1) {
    const n = hashNoise((x * f) | 0, (z * f) | 0, seed + i * 991) / 4294967295;
    sum += n * amp;
    f *= 2;
    amp *= 0.5;
  }
  return sum;
}

function biomeAt(x, z, size, seed) {
  const rim = Math.min(x, z, size - 1 - x, size - 1 - z);
  if (rim < 5) return BIOME.void;
  if (rim < 8) return BIOME.cliff;
  const moist = fbm(x * 0.08, z * 0.08, seed ^ 0x4d415045);
  const crystal = fbm(x * 0.05 + 40, z * 0.05 - 20, seed ^ 0x43525953);
  if (crystal > 0.72) return BIOME.rock;
  if (moist > 0.62) return BIOME.grass;
  if (moist > 0.48) return BIOME.dirt;
  return BIOME.sand;
}

function deriveWalk(terrain, size) {
  const walk = new Uint8Array(size * size).fill(1);
  for (let i = 0; i < terrain.length; i += 1) {
    const b = terrain[i];
    if (b === BIOME.void || b === BIOME.cliff) walk[i] = 0;
  }
  return walk;
}

function mirrorTerrain(terrain, size) {
  const out = new Uint8Array(size * size);
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const mx = size - 1 - x;
      const mz = size - 1 - z;
      const a = terrain[z * size + x];
      const b = terrain[mz * size + mx];
      const pick = hashNoise(x, z, size) & 1 ? a : b;
      out[z * size + x] = pick;
      out[mz * size + mx] = pick;
    }
  }
  return out;
}

function carveCorridor(walk, terrain, size, x0, z0, x1, z1) {
  let x = x0;
  let z = z0;
  while (x !== x1 || z !== z1) {
    if (x < x1) x += 1;
    else if (x > x1) x -= 1;
    if (z < z1) z += 1;
    else if (z > z1) z -= 1;
    const i = z * size + x;
    walk[i] = 1;
    if (terrain[i] === BIOME.void || terrain[i] === BIOME.cliff) terrain[i] = BIOME.dirt;
  }
}

function reachable(walk, size, ax, az, bx, bz) {
  return astar(walk, size, ax, az, bx, bz).length > 0;
}

function distSq(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function startTotals(nodes) {
  const totals = { food: 0, wood: 0, crystal: 0, ore: 0 };
  for (const node of nodes) totals[node.kind] = (totals[node.kind] || 0) + (node.amount | 0);
  return totals;
}

function scatterSymmetric(rng, walk, size, kind, count, amount, cx, cz, enemyCx, enemyCz, nodes) {
  let placed = 0;
  let tries = 0;
  while (placed < count && tries++ < 500) {
    const dx = rng.nextInt(4, 14);
    const dz = rng.nextInt(4, 14);
    const gx = cx + dx;
    const gz = cz + dz;
    const ex = enemyCx - dx;
    const ez = enemyCz - dz;
    if (gx < 2 || gz < 2 || gx >= size - 2 || gz >= size - 2) continue;
    if (ex < 2 || ez < 2 || ex >= size - 2 || ez >= size - 2) continue;
    if (!walk[gz * size + gx] || !walk[ez * size + ex]) continue;
    const amt = amount + rng.nextInt(0, 39);
    nodes.push({ kind, cx: gx, cz: gz, amount: amt });
    nodes.push({ kind, cx: ex, cz: ez, amount: amt });
    placed += 1;
  }
}

export function generateSkirmishMap(seed, size = 96, cell = 2) {
  const rng = new DeterministicPrng(seed >>> 0);
  const terrainArr = new Uint8Array(size * size);
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      terrainArr[z * size + x] = biomeAt(x, z, size, seed);
    }
  }
  const terrain = mirrorTerrain(terrainArr, size);
  const walk = deriveWalk(terrain, size);

  const playerCx = 12;
  const playerCz = size - 13;
  const enemyCx = size - 13;
  const enemyCz = 12;

  for (let dz = -2; dz <= 5; dz += 1) {
    for (let dx = -2; dx <= 5; dx += 1) {
      for (const [cx, cz] of [[playerCx + dx, playerCz + dz], [enemyCx - dx, enemyCz - dz]]) {
        if (cx < 0 || cz < 0 || cx >= size || cz >= size) continue;
        const i = cz * size + cx;
        walk[i] = 1;
        terrain[i] = BIOME.sand;
      }
    }
  }

  if (!reachable(walk, size, playerCx, playerCz, enemyCx, enemyCz)) {
    carveCorridor(walk, terrain, size, playerCx, playerCz, (size / 2) | 0, (size / 2) | 0);
    carveCorridor(walk, terrain, size, enemyCx, enemyCz, (size / 2) | 0, (size / 2) | 0);
  }

  let terrainStr = "";
  for (let i = 0; i < terrain.length; i += 1) terrainStr += biomeCharFromIndex(terrain[i]);
  let walkStr = "";
  for (let i = 0; i < walk.length; i += 1) walkStr += walk[i] ? "1" : "0";

  const resources = [];
  for (const [kind, dx, dz] of DEFAULT_START_NODES) {
    const gx = Math.max(2, Math.min(size - 3, playerCx + dx));
    const gz = Math.max(2, Math.min(size - 3, playerCz + dz));
    const ex = Math.max(2, Math.min(size - 3, enemyCx - dx));
    const ez = Math.max(2, Math.min(size - 3, enemyCz - dz));
    const amount = kind === "food" ? 140 : kind === "wood" ? 160 : 90;
    resources.push({ kind, cx: gx, cz: gz, amount });
    resources.push({ kind, cx: ex, cz: ez, amount });
  }

  scatterSymmetric(rng, walk, size, "food", 10, 90, playerCx, playerCz, enemyCx, enemyCz, resources);
  scatterSymmetric(rng, walk, size, "wood", 12, 110, playerCx, playerCz, enemyCx, enemyCz, resources);
  scatterSymmetric(rng, walk, size, "crystal", 6, 80, playerCx, playerCz, enemyCx, enemyCz, resources);
  scatterSymmetric(rng, walk, size, "ore", 5, 70, playerCx, playerCz, enemyCx, enemyCz, resources);

  return {
    schema: 1,
    id: "random",
    name: "Random Map",
    size,
    cell,
    terrain: terrainStr,
    walk: walkStr,
    starts: {
      player: { cx: playerCx, cz: playerCz, reveal: 16 },
      enemy: { cx: enemyCx, cz: enemyCz, reveal: 12 },
    },
    startNodes: DEFAULT_START_NODES,
    relic: { cx: (size / 2) | 0, cz: (size / 2) | 0 },
    resources,
    props: [],
    seed: seed >>> 0,
  };
}

export function validateSkirmishMap(map) {
  const size = map.size | 0;
  const walkArr = map.walk instanceof Uint8Array ? map.walk : parseWalkLayer(map.walk, size);
  const ps = map.starts?.player;
  const es = map.starts?.enemy;
  if (!ps || !es) return { ok: false, why: "missing starts" };
  const pathOk = reachable(walkArr, size, ps.cx, ps.cz, es.cx, es.cz);
  const playerNodes = map.resources.filter((r) => distSq(r.cx, r.cz, ps.cx, ps.cz) < 18 * 18);
  const enemyNodes = map.resources.filter((r) => distSq(r.cx, r.cz, es.cx, es.cz) < 18 * 18);
  const pt = startTotals(playerNodes);
  const et = startTotals(enemyNodes);
  const parity = ["food", "wood", "crystal", "ore"].every((k) => Math.abs((pt[k] || 0) - (et[k] || 0)) <= (k === "food" ? 200 : 120));
  return { ok: pathOk && parity, pathOk, parity, playerTotals: pt, enemyTotals: et };
}

export function mapLayoutFingerprint(map) {
  return {
    id: map.id,
    size: map.size,
    seed: map.seed >>> 0,
    terrainPrefix: map.terrain.slice(0, 64),
    starts: map.starts,
    resourceCount: map.resources?.length || 0,
  };
}
