/**
 * Ashvein Depths — tunnel layer + lava vent terrain mutation (#26).
 */

import { astar } from "../path.js";
import { BIOME } from "../../data/map-biomes.js";
import { cellOfQ10, secToTicks, worldOfCellQ10 } from "../fixed.js";

export const ASHVEIN_ID = "ashvein";

const MUT_NONE = 0;
const MUT_LAVA = 1;
const MUT_COOL = 2;
const MUT_BRIDGE = 3;

const FLOW_CELL_TICKS = secToTicks(4);
const COOL_CELL_TICKS = secToTicks(10);
const LAVA_DMG = 4;
const ERUPT_BASE = secToTicks(50);
const ERUPT_SPREAD = secToTicks(35);

function cellIdx(world, cx, cz) {
  return cz * world.N + cx;
}

function ashveinCellHash(seed, cx, cz, salt = 0) {
  let h = (seed ^ salt ^ (cx * 73856093) ^ (cz * 19349663)) >>> 0;
  h ^= h << 13;
  h ^= h >>> 17;
  h ^= h << 5;
  return h >>> 0;
}

export function matchHasAshvein(world) {
  return world.players.player.faction === ASHVEIN_ID || world.players.enemy.faction === ASHVEIN_ID;
}

export function isAshveinUnit(u) {
  return u?.kind === "unit" && u.faction === ASHVEIN_ID;
}

function ensureAshveinState(world) {
  if (world.ashvein) return world.ashvein;
  const n = world.N * world.N;
  world.ashvein = {
    tunnelMask: new Uint8Array(n),
    entranceMask: new Uint8Array(n),
    cellMutation: new Uint8Array(n),
    mutationTick: new Int32Array(n),
    vents: [],
    terrainDirty: false,
  };
  return world.ashvein;
}

function inBounds(world, cx, cz) {
  return cx >= 0 && cz >= 0 && cx < world.N && cz < world.N;
}

function isEntrance(world, cx, cz) {
  const a = world.ashvein;
  if (!a || !inBounds(world, cx, cz)) return false;
  return a.entranceMask[cellIdx(world, cx, cz)] === 1;
}

function isTunnelCell(world, cx, cz) {
  const a = world.ashvein;
  if (!a || !inBounds(world, cx, cz)) return false;
  const i = cellIdx(world, cx, cz);
  return a.tunnelMask[i] === 1 || a.entranceMask[i] === 1;
}

function carveTunnelSegment(world, x0, z0, x1, z1) {
  const a = ensureAshveinState(world);
  let x = x0;
  let z = z0;
  while (x !== x1 || z !== z1) {
    if (inBounds(world, x, z)) a.tunnelMask[cellIdx(world, x, z)] = 1;
    if (x < x1) x += 1;
    else if (x > x1) x -= 1;
    if (z < z1) z += 1;
    else if (z > z1) z -= 1;
  }
  if (inBounds(world, x1, z1)) a.tunnelMask[cellIdx(world, x1, z1)] = 1;
}

function markEntrance(world, cx, cz) {
  const a = ensureAshveinState(world);
  if (!inBounds(world, cx, cz)) return;
  const i = cellIdx(world, cx, cz);
  a.entranceMask[i] = 1;
  a.tunnelMask[i] = 1;
}

function computeFlowPath(world, cx, cz, maxLen = 8) {
  const path = [[cx, cz]];
  const dirs = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  let x = cx;
  let z = cz;
  const seed = world.seed >>> 0;
  for (let step = 0; step < maxLen; step += 1) {
    const h = ashveinCellHash(seed, x, z, 0x4c415641 + step);
    const order = dirs
      .map((d, i) => ({ d, k: ashveinCellHash(h, i, step, 0) }))
      .sort((a, b) => a.k - b.k)
      .map((o) => o.d);
    let moved = false;
    for (const [dx, dz] of order) {
      const nx = x + dx;
      const nz = z + dz;
      if (!inBounds(world, nx, nz)) continue;
      const i = cellIdx(world, nx, nz);
      if (!world.walk[i] && world.ashvein.cellMutation[i] !== MUT_BRIDGE) continue;
      x = nx;
      z = nz;
      path.push([x, z]);
      moved = true;
      break;
    }
    if (!moved) break;
  }
  return path;
}

function seedTunnelNetwork(world) {
  const n = world.N;
  const ps = world.map?.starts?.player || { cx: 6, cz: n - 8 };
  const es = world.map?.starts?.enemy || { cx: n - 8, cz: 6 };
  const midX = (n / 2) | 0;
  const midZ = (n / 2) | 0;
  const clamp = (v) => Math.max(4, Math.min(n - 5, v));

  markEntrance(world, clamp(ps.cx + 4), clamp(ps.cz - 6));
  markEntrance(world, clamp(es.cx - 5), clamp(es.cz + 5));
  markEntrance(world, midX, clamp(midZ + 8));

  carveTunnelSegment(world, clamp(ps.cx + 4), clamp(ps.cz - 6), midX, midZ);
  carveTunnelSegment(world, midX, midZ, clamp(es.cx - 5), clamp(es.cz + 5));
  carveTunnelSegment(world, midX, midZ, midX, clamp(midZ + 8));
}

function nearAnyStart(world, cx, cz, r) {
  const rSq = r * r;
  for (const start of Object.values(world.map?.starts || {})) {
    if (!start) continue;
    const dx = cx - start.cx;
    const dz = cz - start.cz;
    if (dx * dx + dz * dz <= rSq) return true;
  }
  return false;
}

function seedLavaVents(world) {
  const a = ensureAshveinState(world);
  const n = world.N;
  const seed = world.seed >>> 0;
  const candidates = [];
  for (let z = 6; z < n - 6; z += 3) {
    for (let x = 6; x < n - 6; x += 3) {
      if (!world.walk[cellIdx(world, x, z)]) continue;
      if (nearAnyStart(world, x, z, 18)) continue;
      const h = ashveinCellHash(seed, x, z, 0x56454e54);
      if (h % 11 !== 0) continue;
      candidates.push([x, z, h]);
    }
  }
  candidates.sort((a, b) => a[2] - b[2]);
  for (let i = 0; i < Math.min(3, candidates.length); i += 1) {
    const [cx, cz, h] = candidates[i];
    a.vents.push({
      cx,
      cz,
      flowPath: computeFlowPath(world, cx, cz, 6 + (h % 4)),
      phase: "idle",
      phaseLeft: 0,
      flowIndex: 0,
      nextErupt: ERUPT_BASE + (h % ERUPT_SPREAD) + i * secToTicks(12),
    });
  }
}

function applyMapProps(world) {
  for (const prop of world.map?.props || []) {
    const cx = prop.cx | 0;
    const cz = prop.cz | 0;
    if (prop.kind === "tunnel") carveTunnelSegment(world, cx, cz, cx, cz);
    else if (prop.kind === "tunnel-entrance") markEntrance(world, cx, cz);
    else if (prop.kind === "lava-vent") {
      const a = ensureAshveinState(world);
      const h = ashveinCellHash(world.seed >>> 0, cx, cz, 0x56454e54);
      a.vents.push({
        cx,
        cz,
        flowPath: computeFlowPath(world, cx, cz, 8),
        phase: "idle",
        phaseLeft: 0,
        flowIndex: 0,
        nextErupt: ERUPT_BASE + (h % ERUPT_SPREAD),
      });
    }
  }
}

export function initAshveinWorld(world) {
  if (!matchHasAshvein(world)) return;
  ensureAshveinState(world);
  applyMapProps(world);
  if (!world.ashvein.vents.length) seedLavaVents(world);
  let tunnelCells = 0;
  for (let i = 0; i < world.ashvein.tunnelMask.length; i += 1) tunnelCells += world.ashvein.tunnelMask[i];
  if (!tunnelCells) seedTunnelNetwork(world);
}

function tunnelWalkGrid(world) {
  const a = world.ashvein;
  const grid = new Uint8Array(a.tunnelMask.length);
  for (let i = 0; i < grid.length; i += 1) grid[i] = a.tunnelMask[i] || a.entranceMask[i] ? 1 : 0;
  return grid;
}

function concatPaths(parts) {
  const out = [];
  for (const part of parts) {
    if (!part.length) return null;
    for (const step of part) {
      const last = out[out.length - 1];
      if (last && last[0] === step[0] && last[1] === step[1]) continue;
      out.push(step);
    }
  }
  return out;
}

function listEntrances(world) {
  const out = [];
  for (let z = 0; z < world.N; z += 1) {
    for (let x = 0; x < world.N; x += 1) {
      if (isEntrance(world, x, z)) out.push([x, z]);
    }
  }
  return out;
}

export function ashveinResolvePath(world, u, xQ10, zQ10) {
  if (!isAshveinUnit(u) || u.layer !== "tunnel") return null;
  const [sx, sz] = cellOfQ10(u.xQ10, u.zQ10, world.CELL);
  const [gx, gz] = cellOfQ10(xQ10, zQ10, world.CELL);
  return astar(tunnelWalkGrid(world), world.N, sx, sz, gx, gz);
}

export function ashveinPlanSurfacePath(world, u, xQ10, zQ10) {
  if (!isAshveinUnit(u) || u.layer === "tunnel") return null;
  const [sx, sz] = cellOfQ10(u.xQ10, u.zQ10, world.CELL);
  const [gx, gz] = cellOfQ10(xQ10, zQ10, world.CELL);
  const surface = astar(world.walk, world.N, sx, sz, gx, gz);
  if (surface.length) return surface;
  const tunnelWalk = tunnelWalkGrid(world);
  let best = null;
  let bestLen = 0x7fffffff;
  for (const [ix, iz] of listEntrances(world)) {
    for (const [ex, ez] of listEntrances(world)) {
      if (ix === ex && iz === ez) continue;
      const tunnelLeg = astar(tunnelWalk, world.N, ix, iz, ex, ez);
      if (!tunnelLeg.length) continue;
      const path = concatPaths([
        astar(world.walk, world.N, sx, sz, ix, iz),
        tunnelLeg,
        astar(world.walk, world.N, ex, ez, gx, gz),
      ]);
      if (path && path.length < bestLen) {
        bestLen = path.length;
        best = path;
      }
    }
  }
  return best || surface;
}

export function unitInTunnelLayer(u) {
  return u?.kind === "unit" && u.layer === "tunnel";
}

export function skipSurfaceVision(entity) {
  return entity.kind === "unit" && entity.layer === "tunnel";
}

export function onUnitStep(world, u, cx, cz) {
  if (!isAshveinUnit(u) || !world.ashvein) return;
  if (u.layer === "tunnel") {
    if (isEntrance(world, cx, cz)) u.layer = "surface";
    return;
  }
  if (!isEntrance(world, cx, cz) || u.path.length <= 1) return;
  let tunnelSteps = 0;
  for (const [px, pz] of u.path) {
    if (isTunnelCell(world, px, pz) && !isEntrance(world, px, pz)) tunnelSteps += 1;
  }
  if (tunnelSteps > 0) {
    const [tx, tz] = u.path[u.path.length - 1];
    const [txQ10, tzQ10] = worldOfCellQ10(tx, tz, world.CELL);
    const tunnelPath = ashveinResolvePath(world, u, txQ10, tzQ10);
    if (tunnelPath?.length) {
      u.layer = "tunnel";
      u.path = tunnelPath;
    }
  }
}

function lavaDamage(_world, unit, dmg) {
  unit.hp -= dmg;
}

function setCellMutation(world, cx, cz, state, tickLeft = 0) {
  const a = world.ashvein;
  const i = cellIdx(world, cx, cz);
  a.cellMutation[i] = state;
  a.mutationTick[i] = tickLeft;
  a.terrainDirty = true;
  world.fogDirty = true;
  if (state === MUT_LAVA || state === MUT_COOL) {
    world.walk[i] = 0;
    if (world.map?.terrain) world.map.terrain[i] = BIOME.cliff;
  } else if (state === MUT_BRIDGE) {
    world.walk[i] = 1;
    if (world.map?.terrain) world.map.terrain[i] = BIOME.rock;
    const rock = world.resources.find((r) => r.kind === "rockblock" && r.cx === cx && r.cz === cz);
    if (rock) {
      world.resources.splice(world.resources.indexOf(rock), 1);
      world.byId.delete(rock.id);
    }
  }
}

function tickVent(world, vent) {
  if (vent.phase === "idle") {
    if (world.t < vent.nextErupt) return;
    vent.phase = "flow";
    vent.flowIndex = 0;
    vent.phaseLeft = FLOW_CELL_TICKS;
    return;
  }
  if (vent.phase !== "flow") return;
  vent.phaseLeft -= 1;
  if (vent.phaseLeft > 0) return;
  if (vent.flowIndex < vent.flowPath.length) {
    const [cx, cz] = vent.flowPath[vent.flowIndex];
    vent.flowIndex += 1;
    setCellMutation(world, cx, cz, MUT_LAVA, COOL_CELL_TICKS);
    for (const u of world.units) {
      if (u.hp <= 0 || u.layer === "tunnel") continue;
      const [ux, uz] = cellOfQ10(u.xQ10, u.zQ10, world.CELL);
      if (ux === cx && uz === cz) lavaDamage(world, u, LAVA_DMG);
    }
    vent.phaseLeft = FLOW_CELL_TICKS;
    return;
  }
  vent.phase = "idle";
  vent.nextErupt = world.t + ERUPT_BASE + (ashveinCellHash(world.seed >>> 0, vent.cx, vent.cz, world.t) % ERUPT_SPREAD);
}

function tickCellMutations(world) {
  const a = world.ashvein;
  for (let z = 0; z < world.N; z += 1) {
    for (let x = 0; x < world.N; x += 1) {
      const i = cellIdx(world, x, z);
      const mut = a.cellMutation[i];
      if (mut !== MUT_LAVA && mut !== MUT_COOL) continue;
      if (a.mutationTick[i] > 0) {
        a.mutationTick[i] -= 1;
        if (mut === MUT_LAVA) {
          for (const u of world.units) {
            if (u.hp <= 0 || u.layer === "tunnel") continue;
            const [ux, uz] = cellOfQ10(u.xQ10, u.zQ10, world.CELL);
            if (ux === x && uz === z) lavaDamage(world, u, LAVA_DMG);
          }
        }
        continue;
      }
      if (mut === MUT_LAVA) setCellMutation(world, x, z, MUT_COOL, COOL_CELL_TICKS);
      else if (mut === MUT_COOL) setCellMutation(world, x, z, MUT_BRIDGE, 0);
    }
  }
}

export function tickAshvein(world) {
  if (!world.ashvein) return;
  for (const vent of world.ashvein.vents) tickVent(world, vent);
  tickCellMutations(world);
}

export function effectiveBiome(world, cellIndex) {
  const mut = world.ashvein?.cellMutation?.[cellIndex] ?? MUT_NONE;
  if (mut === MUT_LAVA) return BIOME.cliff;
  if (mut === MUT_COOL) return BIOME.dirt;
  if (mut === MUT_BRIDGE) return BIOME.rock;
  return world.map?.terrain?.[cellIndex] ?? BIOME.sand;
}

export function minimapCellColor(world, cellIndex, explored) {
  if (!explored) return [7, 20, 34];
  const mut = world.ashvein?.cellMutation?.[cellIndex] ?? MUT_NONE;
  if (mut === MUT_LAVA) return [220, 60, 20];
  if (mut === MUT_COOL) return [120, 50, 30];
  if (mut === MUT_BRIDGE) return [140, 90, 70];
  return null;
}

export function planAshveinFlankPath(world, u, targetXQ10, targetZQ10) {
  const [sx, sz] = cellOfQ10(u.xQ10, u.zQ10, world.CELL);
  const [gx, gz] = cellOfQ10(targetXQ10, targetZQ10, world.CELL);
  const direct = astar(world.walk, world.N, sx, sz, gx, gz);
  const tunnelWalk = tunnelWalkGrid(world);
  let best = null;
  let bestLen = 0x7fffffff;
  for (const [ex, ez] of listEntrances(world)) {
    if (Math.abs(ex - gx) + Math.abs(ez - gz) < 8) continue;
    for (const [ix, iz] of listEntrances(world)) {
      if (ix === ex && iz === ez) continue;
      const flank = concatPaths([
        astar(world.walk, world.N, sx, sz, ix, iz),
        astar(tunnelWalk, world.N, ix, iz, ex, ez),
        astar(world.walk, world.N, ex, ez, gx, gz),
      ]);
      if (flank && flank.length < bestLen) {
        bestLen = flank.length;
        best = flank;
      }
    }
  }
  if (!best) return null;
  if (!direct.length) return best;
  return best.length + 6 < direct.length ? best : null;
}
