import { parseTerrainLayer, parseWalkLayer, BIOME } from "../data/map-biomes.js";

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

function clampCell(v, n) {
  return Math.max(1, Math.min(n - 2, v));
}

function worldOf(cx, cz, cell) {
  return [(cx + 0.5) * cell, (cz + 0.5) * cell];
}

function addResource(world, kind, cx, cz, amount, idFn) {
  const n = world.N;
  const cell = world.CELL;
  if (cx < 0 || cz < 0 || cx >= n || cz >= n) return;
  if (!world.walk[cz * n + cx]) return;
  const [x, z] = worldOf(cx, cz, cell);
  world.resources.push({ id: idFn(), kind, x, z, amount, cx, cz });
}

export function normalizeMap(raw) {
  if (!raw || raw.schema !== 1) throw new Error("Unsupported map schema");
  const size = raw.size | 0;
  if (size < 8 || size > 96) throw new Error("Map size out of range");
  const cell = raw.cell || 2;
  const terrain = parseTerrainLayer(raw.terrain, size);
  const walk = raw.walk ? parseWalkLayer(raw.walk, size) : deriveWalk(terrain, size);
  return {
    schema: 1,
    id: raw.id,
    name: raw.name || raw.id,
    size,
    cell,
    terrain,
    walk,
    starts: raw.starts || {},
    startNodes: raw.startNodes || DEFAULT_START_NODES,
    relic: raw.relic || null,
    resources: raw.resources || [],
    props: raw.props || [],
  };
}

function deriveWalk(terrain, size) {
  const walk = new Uint8Array(size * size).fill(1);
  for (let i = 0; i < terrain.length; i += 1) {
    const biome = terrain[i];
    if (biome === BIOME.void || biome === BIOME.cliff) walk[i] = 0;
  }
  return walk;
}

export function applyMapLayout(world, mapDef, helpers) {
  const map = normalizeMap(mapDef);
  const { spawnBuilding, spawnUnit, revealAround, id } = helpers;
  world.map = map;
  world.mapId = map.id;
  world.N = map.size;
  world.CELL = map.cell;

  world.walk.set(map.walk);
  world.resources.length = 0;

  for (const prop of map.props) {
    const cx = prop.cx | 0;
    const cz = prop.cz | 0;
    if (cx < 0 || cz < 0 || cx >= map.size || cz >= map.size) continue;
    world.walk[cz * map.size + cx] = 0;
    const [x, z] = worldOf(cx, cz, map.cell);
    world.resources.push({
      id: id(),
      kind: prop.kind === "rock" ? "rockblock" : prop.kind,
      x,
      z,
      amount: 0,
      cx,
      cz,
    });
  }

  for (const node of map.resources) {
    addResource(world, node.kind, node.cx | 0, node.cz | 0, node.amount | 0, id);
  }

  const playerStart = map.starts.player;
  const enemyStart = map.starts.enemy;
  if (playerStart) {
    placeStart(world, "player", playerStart.cx, playerStart.cz, map, helpers);
    revealAround(world, "player", playerStart.cx, playerStart.cz, playerStart.reveal ?? 16);
  }
  if (enemyStart && !world.tutorial) {
    placeStart(world, "enemy", enemyStart.cx, enemyStart.cz, map, helpers);
    revealAround(world, "enemy", enemyStart.cx, enemyStart.cz, enemyStart.reveal ?? 12);
  } else if (world.tutorial) {
    world.players.enemy.alive = false;
  }

  if (map.relic) {
    const [x, z] = worldOf(map.relic.cx | 0, map.relic.cz | 0, map.cell);
    world.relics.push({ id: id(), x, z, hp: 80, awake: false });
  }
}

function placeStart(world, owner, cx, cz, map, helpers) {
  const { spawnBuilding, spawnUnit, id } = helpers;
  spawnBuilding(world, owner, "towncenter", cx, cz, true);
  const [x, z] = worldOf(cx + 2, cz + 4, map.cell);
  for (let i = 0; i < 5; i += 1) {
    spawnUnit(world, owner, "villager", x + i * 2.15 - 4.2, z + 2);
  }
  spawnUnit(world, owner, "scout", x, z + 4);
  for (const [kind, dx, dz] of map.startNodes) {
    const gx = clampCell(cx + dx, map.size);
    const gz = clampCell(cz + dz, map.size);
    const amount = kind === "food" ? 140 : kind === "wood" ? 160 : 90;
    addResource(world, kind, gx, gz, amount, id);
  }
}

export function nearMapStart(map, cx, cz, radius = 5) {
  if (!map?.starts) return false;
  for (const start of Object.values(map.starts)) {
    if (!start) continue;
    if (Math.hypot(cx - start.cx, cz - start.cz) < radius) return true;
  }
  return false;
}
