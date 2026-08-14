/**
 * Stormveil Nomads — pack/redeploy, wind lanes, summonable darkness (#25).
 */

import { BUILDINGS } from "../../data/catalog.js";
import { registerCivMechanics } from "./index.js";
import {
  Q10,
  PERMILLE,
  TICKS_PER_SEC,
  secToTicks,
  q10FromWorld,
  worldFromQ10,
  cellOfQ10,
  worldOfCellQ10,
  distanceSquaredQ10,
  isBuilt,
} from "../fixed.js";

export const STORMVEIL_ID = "stormveil";
export const PACKABLE_BUILDINGS = new Set(["house", "barracks", "mill", "lumber", "mine", "spire", "den", "workshop"]);
export const PACK_COST = { wood: 30 };
export const PACK_TIME_SEC = 4;
export const DEPLOY_COST = { wood: 20 };
export const DARKNESS_COST = { crystal: 60 };
export const DARKNESS_COOLDOWN_SEC = 25;
export const DARKNESS_DURATION_SEC = 12;
export const DARKNESS_RADIUS_WORLD = 5;
export const WIND_LANE_SPEED_PERMILLE = 1280;
export const WAGON_UNIT = { hp: 80, maxHp: 80, speed: 2.2, los: 4, pop: 0, dmg: 0, range: 0 };

function canPay(stock, cost) {
  return Object.entries(cost || {}).every(([k, v]) => (stock[k] || 0) >= v);
}
function pay(stock, cost) {
  for (const [k, v] of Object.entries(cost || {})) stock[k] -= v;
}
function allocId(world) {
  let max = 0;
  for (const u of world.units) max = Math.max(max, u.id);
  for (const b of world.buildings) max = Math.max(max, b.id);
  for (const d of world.stormveil?.darkness || []) max = Math.max(max, d.id);
  return max + 1;
}
function freeRect(walk, cx, cz, size, gridN) {
  for (let z = cz; z < cz + size; z++) for (let x = cx; x < cx + size; x++) if (x >= 0 && z >= 0 && x < gridN && z < gridN) walk[z * gridN + x] = 1;
}
function blockRect(walk, cx, cz, size, gridN) {
  for (let z = cz; z < cz + size; z++) for (let x = cx; x < cx + size; x++) if (x >= 0 && z >= 0 && x < gridN && z < gridN) walk[z * gridN + x] = 0;
}
function lineXQ10(world) {
  const mapWorld = world.N * world.CELL;
  return q10FromWorld(4) + Math.trunc((world.brightQ10 * q10FromWorld(mapWorld - 8)) / Q10);
}
function buildWindLanes(world) {
  let h = world.seed >>> 0;
  h = (h * 1664525 + 1013904223) >>> 0;
  const spacing = 6 + (h % 4);
  const offsets = [];
  for (let i = 0; i < 3; i += 1) {
    h = (h * 1664525 + 1013904223) >>> 0;
    offsets.push(h % spacing);
  }
  return { spacing, offsets };
}

export function initStormveil(world) {
  world.stormveil = { windLanes: buildWindLanes(world), darkness: [], packing: {} };
  for (const key of ["player", "enemy"]) if (world.players[key]) world.players[key].stormveil = { darknessCd: 0 };
}
export function isStormveilFaction(faction) {
  return faction === STORMVEIL_ID;
}
export function getUnitSpec(type) {
  return type === "wagon" ? WAGON_UNIT : null;
}
export function isOnWindLane(world, xQ10, zQ10) {
  const sv = world.stormveil;
  if (!sv?.windLanes) return false;
  const [cx, cz] = cellOfQ10(xQ10, zQ10, world.CELL);
  const sum = cx + cz;
  for (const off of sv.windLanes.offsets) if (sum % sv.windLanes.spacing === off) return true;
  return false;
}
export function windLaneSpeedPermille(world, unit) {
  if (!isStormveilFaction(unit.faction)) return PERMILLE;
  return isOnWindLane(world, unit.xQ10, unit.zQ10) ? WIND_LANE_SPEED_PERMILLE : PERMILLE;
}
function isInDarkness(world, xQ10, zQ10) {
  for (const d of world.stormveil?.darkness || []) {
    if (d.leftTicks <= 0) continue;
    if (distanceSquaredQ10({ xQ10, zQ10 }, d) <= d.radiusQ10 * d.radiusQ10) return true;
  }
  return false;
}
export function effectiveInLight(world, xQ10, zQ10) {
  if (isInDarkness(world, xQ10, zQ10)) return false;
  return xQ10 < lineXQ10(world);
}
export function tickStormveil(world) {
  const sv = world.stormveil;
  if (!sv) return;
  for (const idStr of Object.keys(sv.packing)) {
    sv.packing[idStr].leftTicks -= 1;
    if (sv.packing[idStr].leftTicks <= 0) finishPack(world, Number(idStr), sv.packing[idStr]);
  }
  sv.darkness = sv.darkness.filter((d) => { d.leftTicks -= 1; return d.leftTicks > 0; });
  for (const p of Object.values(world.players)) if (p.stormveil?.darknessCd > 0) p.stormveil.darknessCd -= 1;
}
function finishPack(world, buildingId, pack) {
  delete world.stormveil.packing[buildingId];
  const b = world.buildings.find((x) => x.id === buildingId);
  if (!b || b.owner !== pack.owner) return;
  const cargo = { type: b.type, hp: b.hp, maxHp: b.maxHp, buildTicks: b.buildTicks, buildTotalTicks: b.buildTotalTicks, queue: b.queue.map((q) => ({ ...q })) };
  freeRect(world.walk, b.cx, b.cz, b.size, world.N);
  world.buildings = world.buildings.filter((x) => x.id !== buildingId);
  world.units.push({
    id: allocId(world), kind: "unit", type: "wagon", owner: pack.owner, faction: world.players[pack.owner].faction,
    xQ10: b.xQ10, zQ10: b.zQ10, hp: WAGON_UNIT.hp, maxHp: WAGON_UNIT.maxHp, state: "idle", path: [], target: null,
    resource: null, carry: 0, carryKind: null, build: null, attackCdTicks: 0, repathTicks: 0, gatherRemainder: 0,
    facingOctant: 0, remainderX: 0, remainderZ: 0, _moveBudget: 0, cargo,
  });
}
function canPlace(world, cx, cz, size, owner) {
  const gridN = world.N;
  if (cx < 1 || cz < 1 || cx + size >= gridN - 1 || cz + size >= gridN - 1) return false;
  for (let z = cz; z < cz + size; z++) for (let x = cx; x < cx + size; x++) {
    if (!world.walk[z * gridN + x]) return false;
    if (owner === "player" && !world.explored.player[z * gridN + x]) return false;
  }
  return true;
}
function spawnDeployedBuilding(world, owner, type, cx, cz, cargo) {
  const spec = BUILDINGS[type];
  const [xQ10, zQ10] = worldOfCellQ10(cx + spec.size / 2 - 0.5, cz + spec.size / 2 - 0.5, world.CELL);
  world.buildings.push({
    id: allocId(world), kind: "building", type, owner, faction: world.players[owner].faction, cx, cz, size: spec.size, xQ10, zQ10,
    hp: cargo.hp, maxHp: cargo.maxHp, buildTotalTicks: cargo.buildTotalTicks, buildTicks: cargo.buildTicks,
    queue: cargo.queue.map((q) => ({ ...q })), rally: { xQ10: xQ10 + q10FromWorld(spec.size), zQ10: zQ10 + q10FromWorld(spec.size) },
    attackCdTicks: 0, wonderTicks: 0,
  });
  blockRect(world.walk, cx, cz, spec.size, world.N);
}
export function canPackBuilding(world, owner, building) {
  if (!isStormveilFaction(world.players[owner]?.faction)) return { ok: false, why: "Stormveil only." };
  if (!building || building.owner !== owner || building.kind !== "building") return { ok: false, why: "Invalid building." };
  if (!isBuilt(building)) return { ok: false, why: "Finish construction first." };
  if (!PACKABLE_BUILDINGS.has(building.type)) return { ok: false, why: "This structure cannot be packed." };
  if (world.stormveil.packing[building.id]) return { ok: false, why: "Already packing." };
  if (!canPay(world.players[owner].stock, PACK_COST)) return { ok: false, why: "Need 30 wood to pack." };
  return { ok: true };
}
export function tryPackBuilding(world, owner, buildingId) {
  const building = world.buildings.find((b) => b.id === buildingId);
  const check = canPackBuilding(world, owner, building);
  if (!check.ok) return check;
  pay(world.players[owner].stock, PACK_COST);
  world.stormveil.packing[buildingId] = { owner, leftTicks: secToTicks(PACK_TIME_SEC) };
  return { ok: true };
}
export function canDeployPacked(world, owner, wagon, wx, wz) {
  if (!wagon || wagon.type !== "wagon" || wagon.owner !== owner || !wagon.cargo) return { ok: false, why: "Select a loaded wagon." };
  if (!canPay(world.players[owner].stock, DEPLOY_COST)) return { ok: false, why: "Need 20 wood to deploy." };
  const spec = BUILDINGS[wagon.cargo.type];
  const wxQ10 = q10FromWorld(wx); const wzQ10 = q10FromWorld(wz);
  const [cx, cz] = cellOfQ10(wxQ10 - q10FromWorld((spec.size * world.CELL) / 2), wzQ10 - q10FromWorld((spec.size * world.CELL) / 2), world.CELL);
  if (!canPlace(world, cx, cz, spec.size, owner)) return { ok: false, why: "Cannot deploy there." };
  return { ok: true, cx, cz };
}
export function tryDeployPacked(world, owner, wagonId, wx, wz) {
  const wagon = world.units.find((u) => u.id === wagonId);
  const check = canDeployPacked(world, owner, wagon, wx, wz);
  if (!check.ok) return check;
  pay(world.players[owner].stock, DEPLOY_COST);
  spawnDeployedBuilding(world, owner, wagon.cargo.type, check.cx, check.cz, wagon.cargo);
  world.units = world.units.filter((u) => u.id !== wagonId);
  return { ok: true };
}
export function canSummonDarkness(world, owner, wx, wz) {
  if (!isStormveilFaction(world.players[owner]?.faction)) return { ok: false, why: "Stormveil only." };
  const p = world.players[owner];
  if (p.stormveil?.darknessCd > 0) return { ok: false, why: `Darkness cooling down (${Math.ceil(p.stormveil.darknessCd / TICKS_PER_SEC)}s).` };
  if (!canPay(p.stock, DARKNESS_COST)) return { ok: false, why: "Need 60 crystal." };
  const [cx, cz] = cellOfQ10(q10FromWorld(wx), q10FromWorld(wz), world.CELL);
  if (cx < 2 || cz < 2 || cx >= world.N - 2 || cz >= world.N - 2) return { ok: false, why: "Out of bounds." };
  return { ok: true, xQ10: q10FromWorld(wx), zQ10: q10FromWorld(wz) };
}
export function trySummonDarkness(world, owner, wx, wz) {
  const check = canSummonDarkness(world, owner, wx, wz);
  if (!check.ok) return check;
  pay(world.players[owner].stock, DARKNESS_COST);
  world.players[owner].stormveil.darknessCd = secToTicks(DARKNESS_COOLDOWN_SEC);
  world.stormveil.darkness.push({ id: allocId(world), owner, xQ10: check.xQ10, zQ10: check.zQ10, radiusQ10: q10FromWorld(DARKNESS_RADIUS_WORLD), leftTicks: secToTicks(DARKNESS_DURATION_SEC) });
  return { ok: true };
}
function findDeploySpot(world, owner, wagon) {
  const enemyTc = world.buildings.find((b) => b.owner !== owner && b.type === "towncenter");
  const exQ10 = enemyTc?.xQ10 ?? q10FromWorld(world.N * world.CELL * 0.75);
  const ezQ10 = enemyTc?.zQ10 ?? q10FromWorld(world.N * world.CELL * 0.25);
  const spec = BUILDINGS[wagon.cargo.type];
  let best = null; let bestScore = -1;
  for (let cz = 4; cz < world.N - spec.size - 4; cz += 2) for (let cx = 4; cx < world.N - spec.size - 4; cx += 2) {
    const sum = cx + cz;
    if (!world.stormveil.windLanes.offsets.some((off) => sum % world.stormveil.windLanes.spacing === off)) continue;
    if (!canPlace(world, cx, cz, spec.size, owner)) continue;
    const [xQ10, zQ10] = worldOfCellQ10(cx + spec.size / 2, cz + spec.size / 2, world.CELL);
    const away = distanceSquaredQ10({ xQ10, zQ10 }, { xQ10: exQ10, zQ10: ezQ10 });
    if (away > bestScore) { bestScore = away; best = { xQ10, zQ10 }; }
  }
  return best;
}
function isPressured(world, owner) {
  const tc = world.buildings.find((b) => b.owner === owner && b.type === "towncenter" && isBuilt(b));
  if (!tc) return false;
  if (tc.hp < Math.trunc(tc.maxHp * 0.72)) return true;
  const pressureSq = q10FromWorld(14) * q10FromWorld(14);
  for (const u of world.units) {
    if (u.owner === owner || u.owner === "gaia" || u.hp <= 0 || u.type === "villager" || u.type === "scout") continue;
    if (distanceSquaredQ10(u, tc) < pressureSq) return true;
  }
  return false;
}
export function runStormveilAI(world, owner) {
  if (!isStormveilFaction(world.players[owner]?.faction) || !world.players[owner].alive) return;
  if (isPressured(world, owner)) {
    for (const b of world.buildings.filter((x) => x.owner === owner && isBuilt(x) && PACKABLE_BUILDINGS.has(x.type) && !world.stormveil.packing[x.id]).slice(0, 2)) tryPackBuilding(world, owner, b.id);
  }
  for (const w of world.units.filter((u) => u.owner === owner && u.type === "wagon" && u.cargo && u.state === "idle")) {
    const spot = findDeploySpot(world, owner, w);
    if (spot) tryDeployPacked(world, owner, w.id, worldFromQ10(spot.xQ10), worldFromQ10(spot.zQ10));
  }
  const p = world.players[owner];
  if (isPressured(world, owner) && p.stormveil?.darknessCd <= 0 && p.stock.crystal >= DARKNESS_COST) {
    const tc = world.buildings.find((b) => b.owner === owner && b.type === "towncenter");
    if (tc) trySummonDarkness(world, owner, worldFromQ10(tc.xQ10), worldFromQ10(tc.zQ10));
  }
}
export function stormveilChecksum(world) {
  const sv = world.stormveil;
  if (!sv) return null;
  return {
    windSpacing: sv.windLanes?.spacing ?? 0,
    windOffsets: [...(sv.windLanes?.offsets || [])].sort((a, b) => a - b),
    packing: Object.entries(sv.packing).map(([id, pack]) => ({ id: Number(id), left: pack.leftTicks | 0, owner: pack.owner })).sort((a, b) => a.id - b.id),
    darkness: sv.darkness.map((d) => ({ id: d.id, owner: d.owner, xQ10: d.xQ10, zQ10: d.zQ10, left: d.leftTicks | 0 })).sort((a, b) => a.id - b.id),
    wagons: world.units.filter((u) => u.type === "wagon").map((u) => ({ id: u.id, owner: u.owner, xQ10: u.xQ10, zQ10: u.zQ10, cargo: u.cargo?.type || null })).sort((a, b) => a.id - b.id),
    cds: { player: world.players.player?.stormveil?.darknessCd | 0, enemy: world.players.enemy?.stormveil?.darknessCd | 0 },
  };
}
export function windLaneCells(world) {
  const sv = world.stormveil; if (!sv?.windLanes) return [];
  const out = []; const seen = new Set();
  for (let cz = 0; cz < world.N; cz += 1) for (let cx = 0; cx < world.N; cx += 1) {
    const sum = cx + cz;
    for (const off of sv.windLanes.offsets) if (sum % sv.windLanes.spacing === off) { const k = `${cx},${cz}`; if (!seen.has(k)) { seen.add(k); out.push({ cx, cz }); } break; }
  }
  return out;
}
registerCivMechanics(STORMVEIL_ID, { runAI(world, player) { runStormveilAI(world, player.id); } });
