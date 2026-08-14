import { AGES, UNITS, BUILDINGS, VILLAGER_BUILD_LIST } from "../data/catalog.js";
import { civBuff, DEFAULT_CIV_ID, opponentCivId } from "../data/civ-schema.js";
import "../data/civs.js";
import {
  civMechanics,
  resolveAgeCost,
  resolveBuildingCost,
  resolveUnitCost,
} from "./civs/index.js";
import {
  initStormveil,
  tickStormveil,
  effectiveInLight,
  windLaneSpeedPermille,
  getUnitSpec,
} from "./civs/stormveil.js";
import "./civs/stormveil.js";
import {
  initAshveinWorld,
  tickAshvein,
  skipSurfaceVision,
  ashveinResolvePath,
  ashveinPlanSurfacePath,
  onUnitStep,
  isAshveinUnit,
} from "./civs/ashvein.js";
import { astar } from "./path.js";
import { runAI } from "./ai.js";
import { MatchPrng } from "./prng.js";
import { resetIds, allocateId } from "./ids.js";
import { resolveSeed } from "./seed.js";
import { applyMapLayout } from "./map-loader.js";
import { computeFormationSlots } from "./formation.js";
import {
  Q10,
  PERMILLE,
  TICKS_PER_SEC,
  secToTicks,
  q10FromWorld,
  worldFromQ10,
  distanceSquaredQ10,
  distanceQ10FromSq,
  cellOfQ10,
  worldOfCellQ10,
  octantFor,
  fixedMovementStep,
  clampToTarget,
  accumulateMoveBudget,
  q10RangeSq,
  permilleMul,
  brightQ10,
  terrainHashPermille,
  isBuilt,
  buildRatio,
  assertSimPositionsInteger,
  assertSimIntegerInvariant,
} from "./fixed.js";

export const N = 48;
export const CELL = 2;
const MAP = N * CELL;

const ARRIVE_SLACK_Q10 = q10FromWorld(0.12);
const GATHER_ARRIVE_SQ = q10RangeSq(1.65);
const GATHER_RANGE_SQ = q10RangeSq(1.7);
const SEPARATE_MIN_SQ = q10RangeSq(0.72);
const SEPARATE_EPS_SQ = q10RangeSq(0.01);
const UNIT_EDGE_Q10 = q10FromWorld(0.35);
const COMMAND_RES_SQ = q10RangeSq(2.2);
const COMMAND_FOE_SQ = q10RangeSq(2.4);
const TITAN_WAKE_SQ = q10RangeSq(5);
const PROJECTILE_SPEED_Q10_PER_TICK = Math.trunc(q10FromWorld(14) / TICKS_PER_SEC);
const PROJECTILE_HIT_SQ = q10RangeSq(1.4);
const VIS_ENTITY_BATCH = 12;
const INTEGER_ASSERT_EVERY = 60;
const REPATH_GATHER_TICKS = secToTicks(0.5);
const REPATH_BUILD_TICKS = secToTicks(0.5);
const REPATH_ATTACK_TICKS = secToTicks(0.4);

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}




function canPay(stock, cost) {
  return Object.entries(cost || {}).every(([k, v]) => (stock[k] || 0) >= v);
}

function pay(stock, cost) {
  for (const [k, v] of Object.entries(cost || {})) stock[k] -= v;
}

export function canPayStock(stock, cost) {
  return canPay(stock, cost);
}

export function payStock(stock, cost) {
  pay(stock, cost);
}

function effectiveBuff(world, unit) {
  const mech = civMechanics(unit.faction);
  if (mech.brightLineImmune) return { speed: 1000, dmg: 1000, armor: 1000 };
  return civBuff(unit.faction, effectiveInLight(world, unit.xQ10, unit.zQ10));
}

function refund(stock, cost) {
  for (const [k, v] of Object.entries(cost || {})) stock[k] += v;
}

export function createMatch(opts = {}) {
  resetIds();
  const {
    playerFaction = DEFAULT_CIV_ID,
    difficulty = "chieftain",
    tutorial = false,
    campaign = false,
  } = opts;
  const seed = resolveSeed(opts);

  const enemyFaction = opts.enemyFaction || opponentCivId(playerFaction);
  const gridN = opts.map?.size || N;
  const walk = new Uint8Array(gridN * gridN).fill(1);
  const explored = {
    player: new Uint8Array(gridN * gridN),
    enemy: new Uint8Array(gridN * gridN),
  };
  const visible = {
    player: new Uint8Array(gridN * gridN),
    enemy: new Uint8Array(gridN * gridN),
  };

  const world = {
    t: 0,
    seed,
    prng: new MatchPrng(seed),
    mapId: opts.mapId || opts.map?.id || "bright-mesa",
    N: gridN,
    CELL,
    walk,
    explored,
    visible,
    playerFaction,
    enemyFaction,
    tutorial,
    campaign,
    difficulty,
    aiVsAi: Boolean(opts.aiVsAi),
    batchSim: Boolean(opts.batchSim || opts.aiVsAi),
    speed: 1,
    winner: null,
    brightQ10: brightQ10(0),
    titanAwake: false,
    tip: tutorial
      ? "Select your weavers, then tap the glowing fruit."
      : playerFaction === "cogforged"
        ? "Link buildings to your Foundry Core. Assemble units on-site — no food economy."
        : "Scout early. Food first, then timber, then a barracks.",
    objective: tutorial ? "Boom a tiny economy" : campaign ? "Hold the mesa" : "Destroy the rival Town Center",
    players: {
      player: makePlayer("player", playerFaction, campaign),
      enemy: makePlayer("enemy", enemyFaction, false),
    },
    units: [],
    buildings: [],
    resources: [],
    byId: new Map(),
    projectiles: [],
    relics: [],
    fogDirty: true,
    selection: [],
    placement: null,
    events: [],
    assemblies: [],
    _tickAcc: 0,
    _visCycle: false,
    _visCursor: 0,
    _visList: null,
  };

  if (opts.map) {
    applyMapLayout(world, opts.map, { spawnBuilding, spawnUnit, revealAround, id: allocateId });
  } else {
    seedTerrain(world);
    placeStart(world, "player", 6, 40);
    if (!tutorial) placeStart(world, "enemy", 40, 7);
    else world.players.enemy.alive = false;
    placeRelic(world);
    revealAround(world, "player", 6, 40, 16);
    if (!tutorial) revealAround(world, "enemy", 40, 7, 12);
  }
  recomputeVision(world);
  initStormveil(world);
  initAshveinWorld(world);
  return world;
}

function makePlayer(idKey, faction, campaign) {
  const mul = campaign ? 0.75 : 1;
  const player = {
    id: idKey,
    faction,
    alive: true,
    age: 1,
    agingTicks: 0,
    stock: {
      food: Math.floor(200 * mul),
      wood: Math.floor(200 * mul),
      crystal: Math.floor(80 * mul),
      ore: 50,
    },
    pop: 0,
    popCap: 0,
    rates: { food: 0, wood: 0, crystal: 0, ore: 0 },
    gathered: { food: 0, wood: 0, crystal: 0, ore: 0 },
    stats: { unitsTrained: 0, unitsLost: 0, buildingsRazed: 0 },
    attackWaveAtTick: secToTicks(90),
  };
  civMechanics(faction).adjustStartingStock(player.stock);
  return player;
}

function blockRect(walk, cx, cz, size, gridN = Math.round(Math.sqrt(walk.length))) {
  for (let z = cz; z < cz + size; z++) {
    for (let x = cx; x < cx + size; x++) {
      if (x >= 0 && z >= 0 && x < gridN && z < gridN) walk[z * gridN + x] = 0;
    }
  }
}

function freeRect(walk, cx, cz, size, gridN = Math.round(Math.sqrt(walk.length))) {
  for (let z = cz; z < cz + size; z++) {
    for (let x = cx; x < cx + size; x++) {
      if (x >= 0 && z >= 0 && x < gridN && z < gridN) walk[z * gridN + x] = 1;
    }
  }
}

function seedTerrain(world) {
  const gridN = world.N;
  for (let z = 0; z < gridN; z++) {
    for (let x = 0; x < gridN; x++) {
      if (terrainHashPermille(x, z) > 930 && x > 8 && z > 8 && x < gridN - 8 && z < gridN - 8) {
        world.walk[z * gridN + x] = 0;
        const rock = {
          id: allocateId(),
          kind: "rockblock",
          xQ10: q10FromWorld((x + 0.5) * CELL),
          zQ10: q10FromWorld((z + 0.5) * CELL),
          amount: 0,
        };
        world.resources.push(rock);
        world.byId.set(rock.id, rock);
      }
    }
  }
  scatter(world, "food", 18, 90);
  scatter(world, "wood", 22, 110);
  scatter(world, "crystal", 10, 80);
  scatter(world, "ore", 8, 70);
}

function scatter(world, kind, count, amount) {
  const rng = world.prng.event;
  const gridN = world.N;
  let n = 0;
  let tries = 0;
  while (n < count && tries++ < 400) {
    const cx = rng.nextInt(2, gridN - 3);
    const cz = rng.nextInt(2, gridN - 3);
    if (!world.walk[cz * gridN + cx]) continue;
    if (nearStart(cx, cz, gridN)) continue;
    const [xQ10, zQ10] = worldOfCellQ10(cx, cz, CELL);
    const res = { id: allocateId(), kind, xQ10, zQ10, amount: amount + rng.nextInt(0, 39), cx, cz };
    world.resources.push(res);
    world.byId.set(res.id, res);
    n++;
  }
}

function nearStart(cx, cz, gridN = N) {
  const d1 = (cx - 6) * (cx - 6) + (cz - 40) * (cz - 40);
  const d2 = (cx - 40) * (cx - 40) + (cz - 7) * (cz - 7);
  return d1 < 25 || d2 < 25;
}

function placeStart(world, owner, cx, cz) {
  spawnBuilding(world, owner, "towncenter", cx, cz, true);
  const [xQ10, zQ10] = worldOfCellQ10(cx + 2, cz + 4, CELL);
  for (let i = 0; i < 5; i++) {
  spawnUnit(world, owner, "villager", xQ10 + q10FromWorld(i * 2.15 - 4.2), zQ10 + q10FromWorld(2));
  }
  spawnUnit(world, owner, "scout", xQ10, zQ10 + q10FromWorld(4));
  seedStartNodes(world, cx, cz);
}

function seedStartNodes(world, cx, cz) {
  const gridN = world.N;
  const spots = [
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
  for (const [kind, dx, dz] of spots) {
    const gx = clampCell(cx + dx, gridN);
    const gz = clampCell(cz + dz, gridN);
    if (!world.walk[gz * gridN + gx]) continue;
    const [xQ10, zQ10] = worldOfCellQ10(gx, gz, CELL);
    const spot = {
      id: allocateId(),
      kind,
      xQ10,
      zQ10,
      amount: kind === "food" ? 140 : kind === "wood" ? 160 : 90,
      cx: gx,
      cz: gz,
    };
    world.resources.push(spot);
    world.byId.set(spot.id, spot);
  }
}

function clampCell(v, gridN = N) {
  return Math.max(1, Math.min(gridN - 2, v));
}

function placeRelic(world) {
  const [xQ10, zQ10] = worldOfCellQ10(23, 23, CELL);
  world.relics.push({ id: allocateId(), xQ10, zQ10, hp: 80, awake: false });
}

function spawnBuilding(world, owner, type, cx, cz, instant) {
  const spec = BUILDINGS[type];
  const buildTotalTicks = secToTicks(spec.time);
  const [xQ10, zQ10] = worldOfCellQ10(cx + spec.size / 2 - 0.5, cz + spec.size / 2 - 0.5, CELL);
  const faction = world.players[owner]?.faction || "gaia";
  const b = {
    id: allocateId(),
    kind: "building",
    type,
    owner,
    faction,
    cx,
    cz,
    size: spec.size,
    xQ10,
    zQ10,
    hp: instant ? spec.hp : 30,
    maxHp: spec.hp,
    buildTotalTicks,
    buildTicks: instant ? buildTotalTicks : Math.max(1, Math.round(buildTotalTicks * 0.05)),
    queue: [],
    rally: { xQ10: xQ10 + q10FromWorld(spec.size), zQ10: zQ10 + q10FromWorld(spec.size) },
    attackCdTicks: 0,
    wonderTicks: 0,
    powered: type === "towncenter" || !civMechanics(faction).usesPowerGrid,
  };
  world.buildings.push(b);
  world.byId.set(b.id, b);
  blockRect(world.walk, cx, cz, spec.size);
  return b;
}

function spawnUnit(world, owner, type, xQ10, zQ10) {
  const spec = UNITS[type];
  const u = {
    id: allocateId(),
    kind: "unit",
    type,
    owner,
    faction: world.players[owner]?.faction || "gaia",
    xQ10,
    zQ10,
    hp: spec.hp,
    maxHp: spec.hp,
    state: "idle",
    path: [],
    target: null,
    resource: null,
    carry: 0,
    carryKind: null,
    build: null,
    assemble: null,
    attackCdTicks: 0,
    repathTicks: 0,
    gatherRemainder: 0,
    facingOctant: 0,
    remainderX: 0,
    remainderZ: 0,
    _moveBudget: 0,
  };
  world.units.push(u);
  world.byId.set(u.id, u);
  return u;
}

function revealAround(world, owner, cx, cz, r) {
  const gridN = world.N;
  const exp = world.explored[owner];
  for (let z = cz - r; z <= cz + r; z++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || z < 0 || x >= gridN || z >= gridN) continue;
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) <= r * r) exp[z * gridN + x] = 1;
    }
  }
}

function collectVisionEntities(world) {
  const list = [];
  for (const owner of ["player", "enemy"]) {
    for (const u of world.units) {
      if (u.owner === owner && !skipSurfaceVision(u)) list.push({ owner, e: u, kind: "unit" });
    }
    for (const b of world.buildings) {
      if (b.owner === owner && isBuilt(b)) list.push({ owner, e: b, kind: "building" });
    }
  }
  return list;
}

function applyEntityVision(world, owner, e, kind, cell, gridN) {
  const spec = kind === "unit" ? UNITS[e.type] || getUnitSpec(e.type) : BUILDINGS[e.type];
  if (!spec) return;
  const r = spec.los || 5;
  const [cx, cz] = cellOfQ10(e.xQ10, e.zQ10, cell);
  revealAround(world, owner, cx, cz, r);
  const vis = world.visible[owner];
  for (let z = cz - r; z <= cz + r; z++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || z < 0 || x >= gridN || z >= gridN) continue;
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) <= r * r) vis[z * gridN + x] = 1;
    }
  }
}

function recomputeVision(world) {
  world.visible.player.fill(0);
  world.visible.enemy.fill(0);
  const cell = world.CELL;
  const gridN = world.N;
  for (const { owner, e, kind } of collectVisionEntities(world)) {
    applyEntityVision(world, owner, e, kind, cell, gridN);
  }
  world.fogDirty = true;
  world._visCycle = false;
  world._visCursor = 0;
  world._visList = null;
}

function beginVisionCycle(world) {
  world.visible.player.fill(0);
  world.visible.enemy.fill(0);
  world._visList = collectVisionEntities(world);
  world._visCursor = 0;
  world._visCycle = true;
}

function tickVision(world) {
  if (world.fogDirty === undefined) {
    recomputeVision(world);
    return;
  }
  if (!world._visCycle) beginVisionCycle(world);
  const list = world._visList || [];
  const cell = world.CELL;
  const gridN = world.N;
  const end = Math.min(list.length, world._visCursor + VIS_ENTITY_BATCH);
  for (let i = world._visCursor; i < end; i += 1) {
    const { owner, e, kind } = list[i];
    applyEntityVision(world, owner, e, kind, cell, gridN);
  }
  world._visCursor = end;
  if (world._visCursor >= list.length) {
    world._visCycle = false;
    world._visCursor = 0;
    world._visList = null;
    world.fogDirty = true;
  }
}

function popOf(world, owner) {
  let used = 0;
  let cap = 0;
  const faction = world.players[owner].faction;
  for (const u of world.units) {
    if (u.owner !== owner) continue;
    used += (UNITS[u.type] || getUnitSpec(u.type))?.pop || 0;
  }
  for (const b of world.buildings) {
    if (b.owner === owner && isBuilt(b)) cap += BUILDINGS[b.type].pop || 0;
  }
  for (const b of world.buildings) {
    if (b.owner !== owner) continue;
    for (const q of b.queue) used += UNITS[q.type]?.pop || 0;
  }
  used += civMechanics(faction).assemblyPop(world, owner);
  cap = Math.min(50, cap);
  return { used, cap };
}

export function popHeadroom(world, owner) {
  const pop = popOf(world, owner);
  return pop.cap - pop.used;
}

export function updateWorld(world, dt) {
  if (world.winner) return;
  world._tickAcc = (world._tickAcc || 0) + dt * TICKS_PER_SEC * world.speed;
  const ticks = Math.trunc(world._tickAcc);
  if (ticks <= 0) return;
  world._tickAcc -= ticks;
  for (let i = 0; i < ticks; i += 1) simTick(world);
}

function simTick(world) {
  world.t += 1;
  world.brightQ10 = brightQ10(world.t);
  for (const p of Object.values(world.players)) {
    p.rates = { food: 0, wood: 0, crystal: 0, ore: 0 };
  }
  tickAging(world);
  tickCivMechanics(world);
  tickStormveil(world);
  tickAshvein(world);
  tickBuildings(world);
  tickUnits(world);
  tickProjectiles(world);
  tickTitan(world);
  tickWonders(world);
  finishAssemblies(world);
  separate(world);
  tickVision(world);
  const pp = popOf(world, "player");
  const ep = popOf(world, "enemy");
  world.players.player.pop = pp.used;
  world.players.player.popCap = pp.cap;
  world.players.enemy.pop = ep.used;
  world.players.enemy.popCap = ep.cap;
  if (!world.tutorial) runAI(world);
  checkVictory(world);
  if (typeof process !== "undefined" && process.env?.SIM_ASSERT_Q10 !== "0") {
    assertSimPositionsInteger(world);
    if (world.t % INTEGER_ASSERT_EVERY === 0) assertSimIntegerInvariant(world);
  }
}

function lineXQ10(world) {
  const mapWorld = world.N * world.CELL;
  return q10FromWorld(4) + Math.trunc((world.brightQ10 * q10FromWorld(mapWorld - 8)) / Q10);
}

export function lineX(world) {
  return worldFromQ10(lineXQ10(world));
}

export function inLight(world, xQ10) {
  return xQ10 < lineXQ10(world);
}

export function emitVfx(world, kind, x, z, opts = {}) {
  (world.vfxEvents ||= []).push({ kind, x, z, ...opts });
}

function tickCivMechanics(world) {
  for (const owner of ["player", "enemy"]) {
    const mech = civMechanics(world.players[owner].faction);
    if (mech.usesPowerGrid) mech.tick(world, owner);
    mech.tickAssemblies(world);
  }
}

function finishAssemblies(world) {
  if (!world.assemblies?.length) return;
  const keep = [];
  for (const site of world.assemblies) {
    if (site.buildTicks < site.buildTotalTicks) {
      keep.push(site);
      continue;
    }
    const b = world.byId.get(site.buildingId);
    const u = spawnUnit(world, site.owner, site.type, site.xQ10, site.zQ10);
    if (b) issueMove(world, u, b.rally.xQ10, b.rally.zQ10);
    for (const worker of world.units) {
      if (worker.assemble === site.id && (worker.state === "assemble" || worker.state === "assemblewalk")) {
        worker.assemble = null;
        worker.state = "idle";
      }
    }
  }
  world.assemblies = keep;
}

function tickAging(world) {
  for (const p of Object.values(world.players)) {
    if (p.agingTicks > 0) {
      p.agingTicks -= 1;
      if (p.agingTicks <= 0) {
        p.age = Math.min(3, p.age + 1);
        p.agingTicks = 0;
        if (p.id === "player") world.tip = `You reached ${AGES[p.age - 1].name}.`;
      }
    }
  }
}

function tickBuildings(world) {
  for (const b of world.buildings) {
    if (!isBuilt(b)) continue;
    if (!civMechanics(b.faction).isBuildingActive(world, b)) continue;
    const spec = BUILDINGS[b.type];
    if (spec.attacks && b.hp > 0 && !world.batchSim) {
      if (b.attackCdTicks > 0) b.attackCdTicks -= 1;
      if (b.attackCdTicks <= 0) {
        const foe = closestFoe(world, b, spec.attacks.range);
        if (foe) {
          fire(world, b, foe, spec.attacks.dmg);
          b.attackCdTicks = secToTicks(spec.attacks.cd);
        }
      }
    }
    if (!b.queue.length) continue;
    const job = b.queue[0];
    job.leftTicks -= 1;
    if (job.leftTicks <= 0) {
      b.queue.shift();
      const rxQ10 = b.rally.xQ10; const rzQ10 = b.rally.zQ10;
      const u = spawnUnit(world, b.owner, job.type, b.xQ10 + q10FromWorld(1.2), b.zQ10 + q10FromWorld(spec.size));
      world.players[b.owner].stats.unitsTrained++;
      issueMove(world, u, rxQ10, rzQ10);
    }
  }
}

function tickUnits(world) {
  for (const u of world.units) {
    if (u.hp <= 0) {
      if (!u.deathCounted && u.owner !== "gaia") {
        u.deathCounted = true;
        world.players[u.owner].stats.unitsLost++;
      }
      continue;
    }
    const spec = UNITS[u.type] || getUnitSpec(u.type);
    if (!spec) continue;
    const buff = effectiveBuff(world, u);
    const speedMul = permilleMul(buff.speed, windLaneSpeedPermille(world, u));
    civMechanics(u.faction).tickUnit(world, u);
    if (u.attackCdTicks > 0) u.attackCdTicks -= 1;
    if (u.state === "build" || u.state === "buildwalk") {
      const site = world.byId.get(u.build);
      if (!site || site.hp <= 0) {
        u.state = "idle";
        u.build = null;
        u.path = [];
      }
    }
    if (u.state === "walk" || u.state === "return" || u.state === "gatherwalk" || u.state === "buildwalk" || u.state === "assemblewalk") {
      followPath(world, u, spec.speed, speedMul);
    }
    if (u.state === "gather") gatherTick(world, u, spec);
    if (u.state === "build") buildTick(world, u);
    if (u.state === "assemble" || u.state === "assemblewalk") assembleWalkTick(world, u);
    if (u.state === "attack" || u.state === "attackmove") attackTick(world, u, spec, buff, speedMul);
    if (u.type !== "villager" && u.type !== "wagon" && u.state === "idle") {
      if (world.batchSim && u.type === "scout") continue;
      const foe = closestFoe(world, u, spec.range + 1.5);
      if (foe) {
        u.state = "attack";
        u.target = foe.id;
      }
    }
  }
  world.units = world.units.filter((u) => {
    if (u.hp <= 0) world.byId.delete(u.id);
    return u.hp > 0;
  });
  world.buildings = world.buildings.filter((b) => {
    if (b.hp <= 0) world.byId.delete(b.id);
    return b.hp > 0;
  });
}

function followPath(world, u, speed, speedPermille) {
  if (u.state === "return") {
    const drop = nearestDrop(world, u, u.carryKind);
    const dropR = drop ? q10FromWorld((drop.size || 2) * world.CELL * 0.45 + 1.35) : 0;
    if (drop && distanceSquaredQ10(u, drop) < dropR * dropR) {
      u.path = [];
      arriveDrop(world, u);
      return;
    }
  }
  if (u.state === "gatherwalk") {
    const res = world.byId.get(u.resource);
    if (res && distanceSquaredQ10(u, res) < GATHER_ARRIVE_SQ) {
      u.path = [];
      u.state = "gather";
      return;
    }
  }
  if (u.state === "buildwalk") {
    const b = world.byId.get(u.build);
    if (b && distanceSquaredQ10(u, b) <= q10RangeSq(b.size + 1.2)) {
      u.path = [];
      u.state = "build";
      return;
    }
    if (b && !u.path.length) {
      if (u.repathTicks > 0) u.repathTicks -= 1;
      if (u.repathTicks <= 0) {
        setBuildApproachPath(world, u, b);
        u.repathTicks = REPATH_BUILD_TICKS;
      }
      return;
    }
  }
  if (!u.path.length) {
    if (u.state === "gatherwalk") u.state = "gather";
    else if (u.state === "return") arriveDrop(world, u);
    else if (u.state === "buildwalk") u.state = "build";
    else if (u.state === "assemblewalk") u.state = "assemble";
    else if (u.state === "attackmove") u.state = "attack";
    else u.state = "idle";
    return;
  }
  const [cx, cz] = u.path[0];
  const [txQ10, tzQ10] = worldOfCellQ10(cx, cz, world.CELL);
  const budget = accumulateMoveBudget(u, speed, speedPermille, 1);
  const deltaX = txQ10 - u.xQ10;
  const deltaZ = tzQ10 - u.zQ10;
  const distSq = deltaX * deltaX + deltaZ * deltaZ;
  if (distSq > 0) {
    if (u.formationFacingOctant != null) {
      u.facingOctant = u.formationFacingOctant;
      u.formationFacingOctant = null;
    } else {
      u.facingOctant = octantFor(deltaX, deltaZ);
    }
  }
  const arriveSq = (budget + ARRIVE_SLACK_Q10) * (budget + ARRIVE_SLACK_Q10);
  if (distSq <= arriveSq || budget <= 0) {
    if (distSq <= arriveSq) {
      u.xQ10 = txQ10;
      u.zQ10 = tzQ10;
      u.remainderX = 0;
      u.remainderZ = 0;
      onUnitStep(world, u, cx, cz);
      u.path.shift();
    }
    return;
  }
  const remainder = { x: u.remainderX, y: u.remainderZ };
  const step = fixedMovementStep(deltaX, deltaZ, budget, remainder);
  u.remainderX = remainder.x;
  u.remainderZ = remainder.y;
  const next = clampToTarget({ x: u.xQ10, y: u.zQ10 }, { x: txQ10, y: tzQ10 }, step);
  u.xQ10 = next.x;
  u.zQ10 = next.y;
}

function gatherTick(world, u, spec) {
  const res = world.byId.get(u.resource);
  if (!res || res.amount <= 0) {
    u.state = "idle";
    u.resource = null;
    return;
  }
  if (distanceSquaredQ10(u, res) > GATHER_RANGE_SQ) {
    if (u.repathTicks > 0) u.repathTicks -= 1;
    if (u.repathTicks <= 0) {
      issueGather(world, u, res);
      u.repathTicks = REPATH_GATHER_TICKS;
    }
    return;
  }
  const ageBonus = world.players[u.owner].age >= 2 ? 1120 : PERMILLE;
  const rateQ10PerTick = Math.trunc((spec.gather * ageBonus * Q10) / (TICKS_PER_SEC * PERMILLE));
  u.gatherRemainder = (u.gatherRemainder || 0) + rateQ10PerTick;
  const units = Math.trunc(u.gatherRemainder / Q10);
  u.gatherRemainder -= units * Q10;
  const take = Math.min(units, res.amount, spec.carry - u.carry);
  if (take > 0) {
    res.amount -= take;
    u.carry += take;
    u.carryKind = res.kind;
    world.players[u.owner].rates[res.kind] += Math.trunc((rateQ10PerTick * TICKS_PER_SEC) / Q10);
    emitVfx(world, "gather", worldFromQ10(res.xQ10), worldFromQ10(res.zQ10), { sub: res.kind });
  }
  if (u.carry >= spec.carry || res.amount <= 0) startReturn(world, u);
}

function startReturn(world, u) {
  const drop = nearestDrop(world, u, u.carryKind);
  if (!drop) {
    u.state = "idle";
    return;
  }
  u.state = "return";
  setPath(world, u, drop.xQ10, drop.zQ10);
}

function arriveDrop(world, u) {
  if (u.carry > 0 && u.carryKind) {
    world.players[u.owner].stock[u.carryKind] += u.carry;
    world.players[u.owner].gathered[u.carryKind] += u.carry;
    u.carry = 0;
  }
  const res = world.byId.get(u.resource);
  if (res && res.amount > 0) issueGather(world, u, res);
  else u.state = "idle";
}

function nearestDrop(world, u, kind) {
  let best = null;
  let bd = 0x7fffffff;
  for (const b of world.buildings) {
    if (b.owner !== u.owner || !isBuilt(b)) continue;
    const spec = BUILDINGS[b.type];
    if (!spec.drop) continue;
    if (spec.drop !== true && spec.drop !== kind) continue;
    const d = distanceSquaredQ10(u, b);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

function assembleWalkTick(world, u) {
  const site = world.assemblies?.find((s) => s.id === u.assemble);
  if (!site) {
    u.state = "idle";
    u.assemble = null;
    return;
  }
  if (distanceSquaredQ10(u, site) <= q10RangeSq(2.4)) {
    u.state = "assemble";
    u.path = [];
    return;
  }
  if (u.repathTicks > 0) u.repathTicks -= 1;
  if (u.repathTicks <= 0) {
    setPath(world, u, site.xQ10, site.zQ10);
    u.repathTicks = REPATH_BUILD_TICKS;
  }
}

function buildTick(world, u) {
  const b = world.byId.get(u.build);
  if (!b || b.hp <= 0) {
    u.state = "idle";
    return;
  }
  if (distanceSquaredQ10(u, b) > q10RangeSq(b.size + 1.2)) {
    if (u.repathTicks > 0) u.repathTicks -= 1;
    if (u.repathTicks <= 0) {
      setPath(world, u, b.xQ10, b.zQ10);
      u.repathTicks = REPATH_BUILD_TICKS;
    }
    u.state = "buildwalk";
    return;
  }
  const spec = BUILDINGS[b.type];
  if (b.buildTicks < b.buildTotalTicks) {
    b.buildTicks += 1;
    const hpPerTick = Math.max(1, Math.trunc(spec.hp / b.buildTotalTicks));
    b.hp = Math.min(spec.hp, b.hp + hpPerTick);
    if (b.buildTicks % secToTicks(0.22) === 0) {
      emitVfx(world, "build", worldFromQ10(b.xQ10), worldFromQ10(b.zQ10));
    }
  }
  if (isBuilt(b)) {
    u.state = "idle";
    u.build = null;
    if (u.owner === "player") world.tip = `${spec.name} complete.`;
  }
}

function attackTick(world, u, spec, buff, speedMul) {
  const foe = findById(world, u.target) || closestFoe(world, u, spec.range + 6);
  if (!foe || foe.hp <= 0) {
    u.target = null;
    if (u.path?.length) {
      u.state = "attackmove";
      followPath(world, u, spec.speed, speedMul);
    } else {
      u.state = "idle";
    }
    return;
  }
  u.target = foe.id;
  const gapSq = edgeDistSq(u, foe);
  if (gapSq > q10RangeSq(spec.range)) {
    if (u.repathTicks > 0) u.repathTicks -= 1;
    if (u.repathTicks <= 0) {
      setPath(world, u, foe.xQ10, foe.zQ10);
      u.repathTicks = REPATH_ATTACK_TICKS;
    }
    u.state = "attackmove";
    followPath(world, u, spec.speed, speedMul);
    return;
  }
  u.path = [];
  if (u.attackCdTicks <= 0) {
    const bonusPermille = foe.kind === "building" ? Math.round((spec.bonusBuilding || 1) * PERMILLE) : PERMILLE;
    const dmg = permilleMul(permilleMul(spec.dmg, buff.dmg), bonusPermille);
    if (spec.range > 2.2) fire(world, u, foe, dmg);
    else hit(world, foe, dmg, u);
    u.attackCdTicks = secToTicks(spec.cd || 1.15);
  }
}

function edgeDistSq(a, b) {
  const extra = b.kind === "building" ? q10FromWorld(((b.size || 2) * CELL) / 2) : UNIT_EDGE_Q10;
  const d = distanceSquaredQ10(a, b);
  const max = Math.max(0, distanceQ10FromSq(d) - extra);
  return max * max;
}

function fire(world, from, to, dmg) {
  world.projectiles.push({
    id: allocateId(),
    xQ10: from.xQ10,
    zQ10: from.zQ10,
    txQ10: to.xQ10,
    tzQ10: to.zQ10,
    target: to.id,
    dmg,
    speedQ10PerTick: PROJECTILE_SPEED_Q10_PER_TICK,
    remainderX: 0,
    remainderZ: 0,
    owner: from.owner,
  });
}

function tickProjectiles(world) {
  const keep = [];
  for (const p of world.projectiles) {
    const dx = p.txQ10 - p.xQ10;
    const dz = p.tzQ10 - p.zQ10;
    const distSq = dx * dx + dz * dz;
    const budget = p.speedQ10PerTick;
    if (distSq <= budget * budget) {
      const t = findById(world, p.target);
      // Impact at the aimed point. Do not damage by id if the target already left —
      // that made the cyan bolt kill villagers after they walked away.
      if (t && distanceSquaredQ10(p, t) <= PROJECTILE_HIT_SQ) hit(world, t, p.dmg, p);
    } else if (budget > 0) {
      const remainder = { x: p.remainderX, y: p.remainderZ };
      const step = fixedMovementStep(dx, dz, budget, remainder);
      p.remainderX = remainder.x;
      p.remainderZ = remainder.y;
      p.xQ10 += step.x;
      p.zQ10 += step.y;
      keep.push(p);
    } else keep.push(p);
  }
  world.projectiles = keep;
}

function hit(world, t, dmg, src) {
  const buff = t.kind === "unit" ? effectiveBuff(world, t) : { armor: 1000 };
  t.hp -= permilleMul(dmg, buff.armor || 1000);
  emitVfx(world, "hit", worldFromQ10(t.xQ10), worldFromQ10(t.zQ10), { dmg });
  if (t.kind === "unit" && t.state === "idle" && t.type === "villager") {
    /* keep gathering unless dying */
  }
  if (t.kind === "unit" && t.type !== "villager" && t.state === "idle") {
    t.state = "attack";
    t.target = src.id;
  }
  if (t.hp <= 0) {
    if (t.kind === "building") {
      freeRect(world.walk, t.cx, t.cz, t.size);
      const killer = src?.owner;
      if (killer && killer !== t.owner && killer !== "gaia" && world.players[killer]) {
        world.players[killer].stats.buildingsRazed++;
      }
    }
  }
}

function closestFoe(world, e, range) {
  let best = null;
  let bdSq = q10RangeSq(range);
  const foes = [...world.units, ...world.buildings].filter((o) => o.owner !== e.owner && o.hp > 0 && o.owner !== "gaia");
  if (e.owner === "gaia") {
    /* titan */
  }
  for (const f of [...world.units, ...world.buildings]) {
    if (f.hp <= 0) continue;
    if (e.owner === "gaia") {
      if (f.owner === "gaia") continue;
    } else if (f.owner === e.owner || f.owner === "gaia") continue;
    if (f.kind === "building" && f.buildTicks * 10 < f.buildTotalTicks * 4) continue;
    const dSq = edgeDistSq(e, f);
    if (dSq < bdSq) {
      bdSq = dSq;
      best = f;
    }
  }
  return best;
}

function findById(world, fid) {
  if (!fid) return null;
  const e = world.byId.get(fid);
  return e && (e.kind === "unit" || e.kind === "building") ? e : null;
}

function setPath(world, u, xQ10, zQ10) {
  const [sx, sz] = cellOfQ10(u.xQ10, u.zQ10, world.CELL);
  const [gx, gz] = cellOfQ10(xQ10, zQ10, world.CELL);
  if (isAshveinUnit(u)) {
    u.path = u.layer === "tunnel"
      ? ashveinResolvePath(world, u, xQ10, zQ10) || []
      : ashveinPlanSurfacePath(world, u, xQ10, zQ10) || astar(world.walk, world.N, sx, sz, gx, gz);
    return;
  }
  u.path = astar(world.walk, world.N, sx, sz, gx, gz);
}

export function issueMove(world, u, xQ10, zQ10, facingOctant = null) {
  u.state = "walk";
  u.target = null;
  u.resource = null;
  u.build = null;
  u.assemble = null;
  u.formationFacingOctant = facingOctant;
  setPath(world, u, xQ10, zQ10);
}

export function issueAttackMove(world, u, xQ10, zQ10, facingOctant = null) {
  u.state = "attackmove";
  u.target = null;
  u.formationFacingOctant = facingOctant;
  setPath(world, u, xQ10, zQ10);
}

function issueFormationMove(world, units, xQ10, zQ10, attackMove = false) {
  const mapWorld = world.N * world.CELL;
  const slots = computeFormationSlots(units, xQ10, zQ10, mapWorld);
  for (const slot of slots) {
    if (attackMove) issueAttackMove(world, slot.unit, slot.xQ10, slot.zQ10, slot.facingOctant);
    else issueMove(world, slot.unit, slot.xQ10, slot.zQ10, slot.facingOctant);
  }
}

export function issueGather(world, u, res) {
  if (u.type !== "villager") return;
  const kind = civMechanics(u.faction).filterGatherKind(u.owner, res.kind);
  if (!kind) return;
  u.resource = res.id;
  u.build = null;
  u.assemble = null;
  u.state = "gatherwalk";
  setPath(world, u, res.xQ10, res.zQ10);
}

export function issueAttack(world, u, target) {
  u.target = target.id;
  u.state = "attack";
  u.resource = null;
}

export function issueBuild(world, u, building) {
  if (u.type !== "villager") return;
  u.build = building.id;
  u.resource = null;
  u.assemble = null;
  u.state = "buildwalk";
  if (!setBuildApproachPath(world, u, building)) setPath(world, u, building.xQ10, building.zQ10);
}

/** Path a builder to the nearest passable cell just outside a building footprint
 * (the building's center cell is blocked, so a direct path there always fails). */
function setBuildApproachPath(world, u, b) {
  const [px, pz] = cellOfQ10(b.xQ10, b.zQ10, world.CELL);
  const r = Math.ceil(b.size / 2);
  const steps = [
    [r, 0], [-r, 0], [0, r], [0, -r],
    [r, r], [-r, r], [r, -r], [-r, -r],
  ];
  for (const [dx, dz] of steps) {
    const tx = px + dx;
    const tz = pz + dz;
    if (tx < 1 || tz < 1 || tx >= world.N - 1 || tz >= world.N - 1) continue;
    if (!world.walk[tz * world.N + tx]) continue;
    const [wx, wz] = worldOfCellQ10(tx, tz, world.CELL);
    setPath(world, u, wx, wz);
    if (u.path.length) return true;
  }
  return false;
}

export function issueAssemble(world, u, site) {
  if (u.type !== "villager") return;
  u.assemble = site.id;
  u.build = null;
  u.resource = null;
  u.state = "assemblewalk";
  setPath(world, u, site.xQ10, site.zQ10);
}

export function tryPlace(world, owner, type, wx, wz) {
  const spec = BUILDINGS[type];
  const p = world.players[owner];
  if (p.age < spec.age) return { ok: false, why: "Advance in age first." };
  const cost = resolveBuildingCost(p.faction, type, spec.cost);
  if (!canPay(p.stock, cost)) return { ok: false, why: "Not enough resources." };
  const wxQ10 = q10FromWorld(wx); const wzQ10 = q10FromWorld(wz);
  const [cx, cz] = cellOfQ10(wxQ10 - q10FromWorld((spec.size * CELL) / 2), wzQ10 - q10FromWorld((spec.size * CELL) / 2), world.CELL);
  if (!canPlace(world, cx, cz, spec.size, owner)) return { ok: false, why: "Cannot place there." };
  pay(p.stock, cost);
  const b = spawnBuilding(world, owner, type, cx, cz, false);
  const villagers = selectedVillagers(world, owner);
  if (!villagers.length) {
    const idle = world.units.find((u) => u.owner === owner && u.type === "villager" && u.state === "idle");
    if (idle) issueBuild(world, idle, b);
  } else villagers.forEach((v) => issueBuild(world, v, b));
  return { ok: true, building: b };
}

function canPlace(world, cx, cz, size, owner) {
  const gridN = world.N;
  if (cx < 1 || cz < 1 || cx + size >= gridN - 1 || cz + size >= gridN - 1) return false;
  for (let z = cz; z < cz + size; z++) {
    for (let x = cx; x < cx + size; x++) {
      if (!world.walk[z * gridN + x]) return false;
      if (owner === "player" && !world.explored.player[z * gridN + x]) return false;
    }
  }
  return true;
}

export function queueUnit(world, building, type) {
  const mech = civMechanics(world.players[building.owner].faction);
  if (!mech.usesTrainingQueue) return queueAssembly(world, building, type);
  const spec = UNITS[type];
  if (!spec || spec.from !== building.type) return { ok: false, why: "Wrong building." };
  const p = world.players[building.owner];
  if (p.age < spec.age) return { ok: false, why: "Need a later age." };
  if (!mech.isBuildingActive(world, building)) return { ok: false, why: "Building unpowered." };
  const pop = popOf(world, building.owner);
  if (pop.used + spec.pop > pop.cap) return { ok: false, why: "Build more houses." };
  const cost = resolveUnitCost(p.faction, type, spec.cost);
  if (!canPay(p.stock, cost)) return { ok: false, why: "Not enough resources." };
  pay(p.stock, cost);
  building.queue.push({ type, leftTicks: secToTicks(spec.time) });
  return { ok: true };
}

export function queueAssembly(world, building, type) {
  const spec = UNITS[type];
  if (!spec || spec.from !== building.type) return { ok: false, why: "Wrong building." };
  const p = world.players[building.owner];
  const mech = civMechanics(p.faction);
  if (!mech.isBuildingActive(world, building)) return { ok: false, why: "Building unpowered." };
  if (p.age < spec.age) return { ok: false, why: "Need a later age." };
  const pop = popOf(world, building.owner);
  if (pop.used + spec.pop > pop.cap) return { ok: false, why: "Build more houses." };
  const cost = resolveUnitCost(p.faction, type, spec.cost);
  if (!canPay(p.stock, cost)) return { ok: false, why: "Not enough resources." };
  pay(p.stock, cost);
  const site = {
    id: allocateId(),
    owner: building.owner,
    type,
    buildingId: building.id,
    xQ10: building.rally.xQ10,
    zQ10: building.rally.zQ10,
    buildTicks: 0,
    buildTotalTicks: secToTicks(spec.time),
  };
  world.assemblies.push(site);
  const idle = world.units.filter((u) => u.owner === building.owner && u.type === "villager" && u.state === "idle");
  for (const v of idle.slice(0, 2)) issueAssemble(world, v, site);
  return { ok: true, site };
}

export function tryAgeUp(world, owner) {
  const p = world.players[owner];
  if (p.agingTicks > 0 || p.age >= 3) return { ok: false, why: "Already advancing." };
  const next = AGES[p.age];
  const cost = resolveAgeCost(p.faction, next, { food: next.food, crystal: next.crystal, ore: next.ore });
  if (!canPay(p.stock, cost)) return { ok: false, why: "Need more stockpiles to age up." };
  pay(p.stock, cost);
  p.agingTicks = secToTicks(next.time);
  return { ok: true };
}

function selectedVillagers(world, owner) {
  return world.units.filter((u) => world.selection.includes(u.id) && u.owner === owner && u.type === "villager");
}

function separate(world) {
  const us = world.units;
  for (let i = 0; i < us.length; i++) {
    for (let j = i + 1; j < us.length; j++) {
      const a = us[i];
      const b = us[j];
      if (a.state === "gather" || b.state === "gather") continue;
      const distSq = distanceSquaredQ10(a, b);
      if (distSq < SEPARATE_MIN_SQ && distSq > SEPARATE_EPS_SQ) {
        const d = distanceQ10FromSq(distSq);
        let mag = Math.trunc(((q10FromWorld(0.72) - d) * q10FromWorld(0.28)) / Math.max(1, d));
        if (a.state === "return" || b.state === "return" || a.state === "build" || b.state === "build") mag = Math.trunc((mag * 150) / PERMILLE);
        const px = Math.trunc(((a.xQ10 - b.xQ10) * mag) / Q10);
        const pz = Math.trunc(((a.zQ10 - b.zQ10) * mag) / Q10);
        a.xQ10 += px;
        a.zQ10 += pz;
        b.xQ10 -= px;
        b.zQ10 -= pz;
      }
    }
  }
}

function tickTitan(world) {
  const relic = world.relics[0];
  if (!relic || world.titanAwake) return;
  const near = world.units.some((u) => u.type !== "villager" && u.type !== "scout" && distanceSquaredQ10(u, relic) < TITAN_WAKE_SQ);
  if (near) {
    world.titanAwake = true;
    const t = spawnUnit(world, "gaia", "titan", relic.xQ10, relic.zQ10);
    t.owner = "gaia";
    t.faction = "gaia";
    t.state = "attack";
    world.tip = "The mesa titan woke. You should not have stood on the relic.";
  }
}

function tickWonders(world) {
  const wonderGoal = secToTicks(BUILDINGS.wonder.wonder);
  for (const b of world.buildings) {
    if (b.type !== "wonder" || !isBuilt(b)) continue;
    b.wonderTicks += 1;
    if (b.wonderTicks >= wonderGoal) {
      world.winner = b.owner;
      world.tip = "The wonder completes. The frontier kneels.";
    }
  }
}

function checkVictory(world) {
  const ptc = world.buildings.find((b) => b.owner === "player" && b.type === "towncenter");
  const etc = world.buildings.find((b) => b.owner === "enemy" && b.type === "towncenter");
  if (!ptc) {
    world.winner = "enemy";
    world.tip = "Your Town Center fell.";
    return;
  }
  if (world.tutorial) {
    const house = world.buildings.some((b) => b.owner === "player" && b.type === "house" && isBuilt(b));
    const vills = world.units.filter((u) => u.owner === "player" && u.type === "villager").length;
    if (house && vills >= 7) {
      world.winner = "player";
      world.tip = "Lesson complete. Take a skirmish onto the Bright Line.";
    }
    return;
  }
  if (!etc && world.players.enemy.alive) {
    world.winner = "player";
    world.tip = "Rival Town Center destroyed.";
  }
}

export function commandGround(world, x, z, attackMove = false) {
  const xQ10 = q10FromWorld(x);
  const zQ10 = q10FromWorld(z);
  const sel = selectedEntities(world);
  const res = world.resources.find((r) => r.kind !== "rockblock" && r.amount > 0 && distanceSquaredQ10({ xQ10, zQ10 }, r) < COMMAND_RES_SQ);
  const foe = [...world.units, ...world.buildings].find(
    (e) => e.owner !== "player" && e.hp > 0 && distanceSquaredQ10({ xQ10, zQ10 }, e) < COMMAND_FOE_SQ
  );
  const movers = sel.filter((e) => e.kind === "unit");
  for (const e of movers) {
    if (foe) issueAttack(world, e, foe);
    else if (res && e.type === "villager") issueGather(world, e, res);
  }
  if (!foe && !(res && movers.some((e) => e.type === "villager"))) {
    if (movers.length > 1) issueFormationMove(world, movers, xQ10, zQ10, attackMove);
    else if (movers.length === 1) {
      if (attackMove) issueAttackMove(world, movers[0], xQ10, zQ10);
      else issueMove(world, movers[0], xQ10, zQ10);
    }
  }
  const bsel = sel.find((e) => e.kind === "building");
  if (bsel && !movers.length) bsel.rally = { xQ10, zQ10 };
}

export function selectedEntities(world) {
  const ids = new Set(world.selection);
  return [...world.units, ...world.buildings].filter((e) => ids.has(e.id));
}

export function idleVillager(world) {
  const list = world.units.filter((u) => u.owner === "player" && u.type === "villager" && u.state === "idle");
  if (!list.length) return null;
  const cur = world.selection[0];
  const i = Math.max(0, list.findIndex((u) => u.id === cur));
  const u = list[(i + 1) % list.length];
  world.selection = [u.id];
  return u;
}

export function villagerBuildOptions(world) {
  const age = world.players.player.age;
  const base = VILLAGER_BUILD_LIST.filter((t) => BUILDINGS[t].age <= age);
  return civMechanics(world.players.player.faction).villagerBuildList(base);
}

export function matchStats(world, owner = "player") {
  const p = world.players[owner];
  const g = p.gathered;
  const totalGathered = (g.food | 0) + (g.wood | 0) + (g.crystal | 0) + (g.ore | 0);
  const score = Math.floor(totalGathered * 0.05) + p.stats.unitsTrained * 20 + p.stats.buildingsRazed * 150 - p.stats.unitsLost * 10 + (world.winner === owner ? 400 : 0) + p.age * 100;
  return { duration: world.t, gathered: { ...g }, totalGathered, unitsTrained: p.stats.unitsTrained, unitsLost: p.stats.unitsLost, buildingsRazed: p.stats.buildingsRazed, score };
}
export function formatDuration(ticks) {
  const s = Math.max(0, Math.floor(ticksToSec(ticks)));
  const m = (s / 60) | 0;
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
export { canPay, BUILDINGS, UNITS, q10FromWorld, worldFromQ10, isBuilt, buildRatio };
