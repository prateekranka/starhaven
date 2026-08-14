import { AGES, UNITS, BUILDINGS, VILLAGER_BUILD_LIST } from "../data/catalog.js";
import { astar } from "./path.js";
import { runAI } from "./ai.js";
import { MatchPrng } from "./prng.js";
import { resolveSeed } from "./seed.js";

export const N = 48;
export const CELL = 2;
const MAP = N * CELL;

let nextId = 1;
const id = () => nextId++;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function cellOf(x, z) {
  return [clamp((x / CELL) | 0, 0, N - 1), clamp((z / CELL) | 0, 0, N - 1)];
}

function worldOf(cx, cz) {
  return [(cx + 0.5) * CELL, (cz + 0.5) * CELL];
}

function canPay(stock, cost) {
  return Object.entries(cost || {}).every(([k, v]) => (stock[k] || 0) >= v);
}

function pay(stock, cost) {
  for (const [k, v] of Object.entries(cost || {})) stock[k] -= v;
}

function refund(stock, cost) {
  for (const [k, v] of Object.entries(cost || {})) stock[k] += v;
}

function hash(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function createMatch(opts = {}) {
  nextId = 1;
  const {
    playerFaction = "sunwoven",
    difficulty = "chieftain",
    tutorial = false,
    campaign = false,
  } = opts;
  const seed = resolveSeed(opts);

  const enemyFaction = playerFaction === "sunwoven" ? "gravemark" : "sunwoven";
  const walk = new Uint8Array(N * N).fill(1);
  const explored = {
    player: new Uint8Array(N * N),
    enemy: new Uint8Array(N * N),
  };
  const visible = {
    player: new Uint8Array(N * N),
    enemy: new Uint8Array(N * N),
  };

  const world = {
    t: 0,
    seed,
    prng: new MatchPrng(seed),
    N,
    CELL,
    walk,
    explored,
    visible,
    playerFaction,
    enemyFaction,
    tutorial,
    campaign,
    difficulty,
    speed: 1,
    winner: null,
    bright: 0.35,
    titanAwake: false,
    tip: tutorial ? "Select your weavers, then tap the glowing fruit." : "Scout early. Food first, then timber, then a barracks.",
    objective: tutorial ? "Boom a tiny economy" : campaign ? "Hold the mesa" : "Destroy the rival Town Center",
    players: {
      player: makePlayer("player", playerFaction, campaign),
      enemy: makePlayer("enemy", enemyFaction, false),
    },
    units: [],
    buildings: [],
    resources: [],
    projectiles: [],
    relics: [],
    fogDirty: true,
    selection: [],
    placing: null,
    events: [],
  };

  seedTerrain(world);
  placeStart(world, "player", 6, 40);
  if (!tutorial) placeStart(world, "enemy", 40, 7);
  else {
    world.players.enemy.alive = false;
  }
  placeRelic(world);
  revealAround(world, "player", 6, 40, 16);
  if (!tutorial) revealAround(world, "enemy", 40, 7, 12);
  recomputeVision(world);
  return world;
}

function makePlayer(idKey, faction, campaign) {
  const mul = campaign ? 0.75 : 1;
  return {
    id: idKey,
    faction,
    alive: true,
    age: 1,
    aging: 0,
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
    attackWaveAt: 90,
  };
}

function blockRect(walk, cx, cz, size) {
  for (let z = cz; z < cz + size; z++) {
    for (let x = cx; x < cx + size; x++) {
      if (x >= 0 && z >= 0 && x < N && z < N) walk[z * N + x] = 0;
    }
  }
}

function freeRect(walk, cx, cz, size) {
  for (let z = cz; z < cz + size; z++) {
    for (let x = cx; x < cx + size; x++) {
      if (x >= 0 && z >= 0 && x < N && z < N) walk[z * N + x] = 1;
    }
  }
}

function seedTerrain(world) {
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const h = hash(x, z);
      if (h > 0.93 && x > 8 && z > 8 && x < N - 8 && z < N - 8) {
        world.walk[z * N + x] = 0;
        world.resources.push({
          id: id(),
          kind: "rockblock",
          x: (x + 0.5) * CELL,
          z: (z + 0.5) * CELL,
          amount: 0,
        });
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
  let n = 0;
  let tries = 0;
  while (n < count && tries++ < 400) {
    const cx = rng.nextInt(2, N - 3);
    const cz = rng.nextInt(2, N - 3);
    if (!world.walk[cz * N + cx]) continue;
    if (nearStart(cx, cz)) continue;
    const [x, z] = worldOf(cx, cz);
    world.resources.push({ id: id(), kind, x, z, amount: amount + rng.nextInt(0, 39), cx, cz });
    n++;
  }
}

function nearStart(cx, cz) {
  return Math.hypot(cx - 6, cz - 40) < 5 || Math.hypot(cx - 40, cz - 7) < 5;
}

function placeStart(world, owner, cx, cz) {
  spawnBuilding(world, owner, "towncenter", cx, cz, true);
  const [x, z] = worldOf(cx + 2, cz + 4);
  for (let i = 0; i < 5; i++) {
  spawnUnit(world, owner, "villager", x + i * 2.15 - 4.2, z + 2);
  }
  spawnUnit(world, owner, "scout", x, z + 4);
  seedStartNodes(world, cx, cz);
}

function seedStartNodes(world, cx, cz) {
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
    const gx = clampCell(cx + dx);
    const gz = clampCell(cz + dz);
    if (!world.walk[gz * N + gx]) continue;
    const [x, z] = worldOf(gx, gz);
    world.resources.push({
      id: id(),
      kind,
      x,
      z,
      amount: kind === "food" ? 140 : kind === "wood" ? 160 : 90,
      cx: gx,
      cz: gz,
    });
  }
}

function clampCell(v) {
  return Math.max(1, Math.min(N - 2, v));
}

function placeRelic(world) {
  const [x, z] = worldOf(23, 23);
  world.relics.push({ id: id(), x, z, hp: 80, awake: false });
}

function spawnBuilding(world, owner, type, cx, cz, instant) {
  const spec = BUILDINGS[type];
  const [x, z] = worldOf(cx + spec.size / 2 - 0.5, cz + spec.size / 2 - 0.5);
  const b = {
    id: id(),
    kind: "building",
    type,
    owner,
    faction: world.players[owner].faction,
    cx,
    cz,
    size: spec.size,
    x,
    z,
    hp: instant ? spec.hp : 30,
    maxHp: spec.hp,
    built: instant ? 1 : 0.05,
    queue: [],
    rally: { x: x + spec.size, z: z + spec.size },
    attackCd: 0,
    wonderT: 0,
  };
  world.buildings.push(b);
  blockRect(world.walk, cx, cz, spec.size);
  return b;
}

function spawnUnit(world, owner, type, x, z) {
  const spec = UNITS[type];
  const u = {
    id: id(),
    kind: "unit",
    type,
    owner,
    faction: world.players[owner]?.faction || "gaia",
    x,
    z,
    hp: spec.hp,
    maxHp: spec.hp,
    state: "idle",
    path: [],
    target: null,
    resource: null,
    carry: 0,
    carryKind: null,
    build: null,
    attackCd: 0,
    facing: 0,
  };
  world.units.push(u);
  return u;
}

function revealAround(world, owner, cx, cz, r) {
  const exp = world.explored[owner];
  for (let z = cz - r; z <= cz + r; z++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || z < 0 || x >= N || z >= N) continue;
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) <= r * r) exp[z * N + x] = 1;
    }
  }
}

function recomputeVision(world) {
  for (const owner of ["player", "enemy"]) {
    world.visible[owner].fill(0);
    const losEntities = [...world.units.filter((u) => u.owner === owner), ...world.buildings.filter((b) => b.owner === owner && b.built >= 1)];
    for (const e of losEntities) {
      const spec = e.kind === "unit" ? UNITS[e.type] : BUILDINGS[e.type];
      const r = spec.los || 5;
      const [cx, cz] = cellOf(e.x, e.z);
      revealAround(world, owner, cx, cz, r);
      const vis = world.visible[owner];
      for (let z = cz - r; z <= cz + r; z++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || z < 0 || x >= N || z >= N) continue;
          if ((x - cx) * (x - cx) + (z - cz) * (z - cz) <= r * r) vis[z * N + x] = 1;
        }
      }
    }
  }
  world.fogDirty = true;
}

function popOf(world, owner) {
  let used = 0;
  let cap = 0;
  for (const u of world.units) if (u.owner === owner) used += UNITS[u.type].pop || 0;
  for (const b of world.buildings) {
    if (b.owner === owner && b.built >= 1) cap += BUILDINGS[b.type].pop || 0;
  }
  for (const b of world.buildings) {
    if (b.owner !== owner) continue;
    for (const q of b.queue) used += UNITS[q.type]?.pop || 0;
  }
  cap = Math.min(50, cap);
  return { used, cap };
}

export function updateWorld(world, dt) {
  if (world.winner) return;
  const step = Math.min(dt, 0.08) * world.speed;
  world.t += step;
  world.bright = (Math.sin(world.t / 38) + 1) / 2;
  for (const p of Object.values(world.players)) {
    p.rates = { food: 0, wood: 0, crystal: 0, ore: 0 };
  }
  tickAging(world, step);
  tickBuildings(world, step);
  tickUnits(world, step);
  tickProjectiles(world, step);
  tickTitan(world);
  tickWonders(world, step);
  separate(world, step);
  world._visAcc = (world._visAcc || 0) + step;
  if (world._visAcc >= 0.08 || world.fogDirty === undefined) {
    recomputeVision(world);
    world._visAcc = 0;
  }
  const pp = popOf(world, "player");
  const ep = popOf(world, "enemy");
  world.players.player.pop = pp.used;
  world.players.player.popCap = pp.cap;
  world.players.enemy.pop = ep.used;
  world.players.enemy.popCap = ep.cap;
  if (!world.tutorial) runAI(world, step);
  checkVictory(world);
}

function lineX(world) {
  return 4 + world.bright * (MAP - 8);
}

export function inLight(world, x) {
  return x < lineX(world);
}

function factionBuff(world, u) {
  const light = inLight(world, u.x);
  if (u.faction === "sunwoven") return light ? { speed: 1.14, dmg: 1.1, armor: 1 } : { speed: 1, dmg: 1, armor: 1 };
  if (u.faction === "gravemark") return light ? { speed: 1, dmg: 1, armor: 1 } : { speed: 1.06, dmg: 1.08, armor: 0.82 };
  return { speed: 1, dmg: 1, armor: 1 };
}

function tickAging(world, dt) {
  for (const p of Object.values(world.players)) {
    if (p.aging > 0) {
      p.aging -= dt;
      if (p.aging <= 0) {
        p.age = Math.min(3, p.age + 1);
        p.aging = 0;
        if (p.id === "player") world.tip = `You reached ${AGES[p.age - 1].name}.`;
      }
    }
  }
}

function tickBuildings(world, dt) {
  for (const b of world.buildings) {
    if (b.built < 1) continue;
    const spec = BUILDINGS[b.type];
    if (spec.attacks && b.hp > 0) {
      b.attackCd -= dt;
      if (b.attackCd <= 0) {
        const foe = closestFoe(world, b, spec.attacks.range);
        if (foe) {
          fire(world, b, foe, spec.attacks.dmg);
          b.attackCd = spec.attacks.cd;
        }
      }
    }
    if (!b.queue.length) continue;
    const job = b.queue[0];
    job.left -= dt;
    if (job.left <= 0) {
      b.queue.shift();
      const [rx, rz] = [b.rally.x, b.rally.z];
      const u = spawnUnit(world, b.owner, job.type, b.x + 1.2, b.z + spec.size);
      issueMove(world, u, rx, rz);
    }
  }
}

function tickUnits(world, dt) {
  for (const u of world.units) {
    if (u.hp <= 0) continue;
    const spec = UNITS[u.type];
    const buff = factionBuff(world, u);
    u.attackCd -= dt;
    if (u.state === "walk" || u.state === "return" || u.state === "gatherwalk" || u.state === "buildwalk" || u.state === "attackmove") {
      followPath(world, u, spec.speed * buff.speed, dt);
    }
    if (u.state === "gather") gatherTick(world, u, spec, dt);
    if (u.state === "build") buildTick(world, u, dt);
    if (u.state === "attack" || u.state === "attackmove") attackTick(world, u, spec, buff, dt);
    if (u.type !== "villager" && u.state === "idle") {
      const foe = closestFoe(world, u, spec.range + 1.5);
      if (foe) {
        u.state = "attack";
        u.target = foe.id;
      }
    }
  }
  world.units = world.units.filter((u) => u.hp > 0);
  world.buildings = world.buildings.filter((b) => b.hp > 0);
}

function followPath(world, u, speed, dt) {
  if (u.state === "return") {
    const drop = nearestDrop(world, u, u.carryKind);
    if (drop && dist(u, drop) < (drop.size || 2) * CELL * 0.45 + 1.35) {
      u.path = [];
      arriveDrop(world, u);
      return;
    }
  }
  if (u.state === "gatherwalk") {
    const res = world.resources.find((r) => r.id === u.resource);
    if (res && dist(u, res) < 1.65) {
      u.path = [];
      u.state = "gather";
      return;
    }
  }
  if (u.state === "buildwalk") {
    const b = world.buildings.find((x) => x.id === u.build);
    if (b && dist(u, b) < (b.size || 2) * 0.7 + 1.1) {
      u.path = [];
      u.state = "build";
      return;
    }
  }
  if (!u.path.length) {
    if (u.state === "gatherwalk") u.state = "gather";
    else if (u.state === "return") arriveDrop(world, u);
    else if (u.state === "buildwalk") u.state = "build";
    else if (u.state === "attackmove") u.state = "attack";
    else u.state = "idle";
    return;
  }
  const [cx, cz] = u.path[0];
  const [tx, tz] = worldOf(cx, cz);
  const d = Math.hypot(tx - u.x, tz - u.z);
  const step = speed * dt;
  if (d > 1e-4) u.facing = Math.atan2(tx - u.x, tz - u.z);
  if (d <= step + 0.12) {
    u.x = tx;
    u.z = tz;
    u.path.shift();
  } else {
    u.x += ((tx - u.x) / d) * step;
    u.z += ((tz - u.z) / d) * step;
  }
}

function gatherTick(world, u, spec, dt) {
  const res = world.resources.find((r) => r.id === u.resource);
  if (!res || res.amount <= 0) {
    u.state = "idle";
    u.resource = null;
    return;
  }
  if (dist(u, res) > 1.7) {
    u.repathIn = (u.repathIn || 0) - dt;
    if (u.repathIn <= 0) {
      issueGather(world, u, res);
      u.repathIn = 0.5;
    }
    return;
  }
  const rate = spec.gather * (world.players[u.owner].age >= 2 ? 1.12 : 1);
  const take = Math.min(rate * dt, res.amount, spec.carry - u.carry);
  res.amount -= take;
  u.carry += take;
  u.carryKind = res.kind;
  world.players[u.owner].rates[res.kind] += rate;
  if (u.carry >= spec.carry - 0.01 || res.amount <= 0) startReturn(world, u);
}

function startReturn(world, u) {
  const drop = nearestDrop(world, u, u.carryKind);
  if (!drop) {
    u.state = "idle";
    return;
  }
  u.state = "return";
  setPath(world, u, drop.x, drop.z);
}

function arriveDrop(world, u) {
  if (u.carry > 0 && u.carryKind) {
    world.players[u.owner].stock[u.carryKind] += u.carry;
    world.players[u.owner].gathered[u.carryKind] += u.carry;
    u.carry = 0;
  }
  const res = world.resources.find((r) => r.id === u.resource && r.amount > 0);
  if (res) issueGather(world, u, res);
  else u.state = "idle";
}

function nearestDrop(world, u, kind) {
  let best = null;
  let bd = 1e9;
  for (const b of world.buildings) {
    if (b.owner !== u.owner || b.built < 1) continue;
    const spec = BUILDINGS[b.type];
    if (!spec.drop) continue;
    if (spec.drop !== true && spec.drop !== kind) continue;
    const d = dist(u, b);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

function buildTick(world, u, dt) {
  const b = world.buildings.find((x) => x.id === u.build);
  if (!b || b.hp <= 0) {
    u.state = "idle";
    return;
  }
  if (dist(u, b) > b.size + 1.2) {
    u.repathIn = (u.repathIn || 0) - dt;
    if (u.repathIn <= 0) {
      setPath(world, u, b.x, b.z);
      u.repathIn = 0.5;
    }
    u.state = "buildwalk";
    return;
  }
  const spec = BUILDINGS[b.type];
  b.built = Math.min(1, b.built + dt / spec.time);
  b.hp = Math.min(spec.hp, b.hp + (spec.hp / spec.time) * dt);
  if (b.built >= 1) {
    u.state = "idle";
    u.build = null;
    if (u.owner === "player") world.tip = `${spec.name} complete.`;
  }
}

function attackTick(world, u, spec, buff, dt) {
  const foe = findById(world, u.target) || closestFoe(world, u, spec.range + 6);
  if (!foe || foe.hp <= 0) {
    u.target = null;
    u.state = u.path?.length ? "attackmove" : "idle";
    return;
  }
  u.target = foe.id;
  const gap = edgeDist(u, foe);
  if (gap > spec.range) {
    u.repathIn = (u.repathIn || 0) - dt;
    if (u.repathIn <= 0) {
      setPath(world, u, foe.x, foe.z);
      u.repathIn = 0.4;
    }
    u.state = "attackmove";
    followPath(world, u, spec.speed * buff.speed, dt);
    return;
  }
  u.path = [];
  if (u.attackCd <= 0) {
    const bonus = foe.kind === "building" ? spec.bonusBuilding || 1 : 1;
    const dmg = spec.dmg * buff.dmg * bonus;
    if (spec.range > 2.2) fire(world, u, foe, dmg);
    else hit(world, foe, dmg, u);
    u.attackCd = spec.cd || 1.15;
  }
}

function edgeDist(a, b) {
  const extra = b.kind === "building" ? ((b.size || 2) * CELL) / 2 : 0.35;
  return Math.max(0, dist(a, b) - extra);
}

function fire(world, from, to, dmg) {
  world.projectiles.push({
    id: id(),
    x: from.x,
    z: from.z,
    tx: to.x,
    tz: to.z,
    target: to.id,
    dmg,
    speed: 14,
    owner: from.owner,
  });
}

function tickProjectiles(world, dt) {
  const keep = [];
  for (const p of world.projectiles) {
    const d = Math.hypot(p.tx - p.x, p.tz - p.z);
    const step = p.speed * dt;
    if (d <= step) {
      const t = findById(world, p.target);
      if (t) hit(world, t, p.dmg, p);
    } else {
      p.x += ((p.tx - p.x) / d) * step;
      p.z += ((p.tz - p.z) / d) * step;
      keep.push(p);
    }
  }
  world.projectiles = keep;
}

function hit(world, t, dmg, src) {
  const buff = t.kind === "unit" ? factionBuff(world, t) : { armor: 1 };
  t.hp -= dmg * (buff.armor || 1);
  if (t.kind === "unit" && t.state === "idle" && t.type === "villager") {
    /* keep gathering unless dying */
  }
  if (t.kind === "unit" && t.type !== "villager" && t.state === "idle") {
    t.state = "attack";
    t.target = src.id;
  }
  if (t.hp <= 0 && t.kind === "building") {
    freeRect(world.walk, t.cx, t.cz, t.size);
  }
}

function closestFoe(world, e, range) {
  let best = null;
  let bd = range;
  const foes = [...world.units, ...world.buildings].filter((o) => o.owner !== e.owner && o.hp > 0 && o.owner !== "gaia");
  if (e.owner === "gaia") {
    /* titan */
  }
  for (const f of [...world.units, ...world.buildings]) {
    if (f.hp <= 0) continue;
    if (e.owner === "gaia") {
      if (f.owner === "gaia") continue;
    } else if (f.owner === e.owner || f.owner === "gaia") continue;
    if (f.kind === "building" && f.built < 0.4) continue;
    const d = edgeDist(e, f);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

function findById(world, fid) {
  if (!fid) return null;
  return world.units.find((u) => u.id === fid) || world.buildings.find((b) => b.id === fid);
}

function setPath(world, u, x, z) {
  const [sx, sz] = cellOf(u.x, u.z);
  const [gx, gz] = cellOf(x, z);
  u.path = astar(world.walk, N, sx, sz, gx, gz);
}

export function issueMove(world, u, x, z) {
  u.state = "walk";
  u.target = null;
  u.resource = null;
  u.build = null;
  setPath(world, u, x, z);
}

export function issueAttackMove(world, u, x, z) {
  u.state = "attackmove";
  u.target = null;
  setPath(world, u, x, z);
}

export function issueGather(world, u, res) {
  if (u.type !== "villager") return;
  u.resource = res.id;
  u.build = null;
  u.state = "gatherwalk";
  setPath(world, u, res.x, res.z);
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
  u.state = "buildwalk";
  setPath(world, u, building.x, building.z);
}

export function tryPlace(world, owner, type, wx, wz) {
  const spec = BUILDINGS[type];
  const p = world.players[owner];
  if (p.age < spec.age) return { ok: false, why: "Advance in age first." };
  if (!canPay(p.stock, spec.cost)) return { ok: false, why: "Not enough resources." };
  const [cx, cz] = cellOf(wx - (spec.size * CELL) / 2, wz - (spec.size * CELL) / 2);
  if (!canPlace(world, cx, cz, spec.size, owner)) return { ok: false, why: "Cannot place there." };
  pay(p.stock, spec.cost);
  const b = spawnBuilding(world, owner, type, cx, cz, false);
  const villagers = selectedVillagers(world, owner);
  if (!villagers.length) {
    const idle = world.units.find((u) => u.owner === owner && u.type === "villager" && u.state === "idle");
    if (idle) issueBuild(world, idle, b);
  } else villagers.forEach((v) => issueBuild(world, v, b));
  return { ok: true, building: b };
}

function canPlace(world, cx, cz, size, owner) {
  if (cx < 1 || cz < 1 || cx + size >= N - 1 || cz + size >= N - 1) return false;
  for (let z = cz; z < cz + size; z++) {
    for (let x = cx; x < cx + size; x++) {
      if (!world.walk[z * N + x]) return false;
      if (owner === "player" && !world.explored.player[z * N + x]) return false;
    }
  }
  return true;
}

export function queueUnit(world, building, type) {
  const spec = UNITS[type];
  if (!spec || spec.from !== building.type) return { ok: false, why: "Wrong building." };
  const p = world.players[building.owner];
  if (p.age < spec.age) return { ok: false, why: "Need a later age." };
  const pop = popOf(world, building.owner);
  if (pop.used + spec.pop > pop.cap) return { ok: false, why: "Build more houses." };
  if (!canPay(p.stock, spec.cost)) return { ok: false, why: "Not enough resources." };
  pay(p.stock, spec.cost);
  building.queue.push({ type, left: spec.time });
  return { ok: true };
}

export function tryAgeUp(world, owner) {
  const p = world.players[owner];
  if (p.aging > 0 || p.age >= 3) return { ok: false, why: "Already advancing." };
  const next = AGES[p.age];
  const cost = { food: next.food, crystal: next.crystal, ore: next.ore };
  if (!canPay(p.stock, cost)) return { ok: false, why: "Need more stockpiles to age up." };
  pay(p.stock, cost);
  p.aging = next.time;
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
      const d = dist(a, b);
      const min = 0.72;
      if (d < min && d > 0.01) {
        let mag = ((min - d) * 0.28) / d;
        if (a.state === "return" || b.state === "return" || a.state === "build" || b.state === "build") mag *= 0.15;
        const px = (a.x - b.x) * mag;
        const pz = (a.z - b.z) * mag;
        a.x += px;
        a.z += pz;
        b.x -= px;
        b.z -= pz;
      }
    }
  }
}

function tickTitan(world) {
  const relic = world.relics[0];
  if (!relic || world.titanAwake) return;
  const near = world.units.some((u) => u.type !== "villager" && u.type !== "scout" && dist(u, relic) < 5);
  if (near) {
    world.titanAwake = true;
    const t = spawnUnit(world, "gaia", "titan", relic.x, relic.z);
    t.owner = "gaia";
    t.faction = "gaia";
    t.state = "attack";
    world.tip = "The mesa titan woke. You should not have stood on the relic.";
  }
}

function tickWonders(world, dt) {
  for (const b of world.buildings) {
    if (b.type !== "wonder" || b.built < 1) continue;
    b.wonderT += dt;
    if (b.wonderT >= BUILDINGS.wonder.wonder) {
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
    const house = world.buildings.some((b) => b.owner === "player" && b.type === "house" && b.built >= 1);
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
  const sel = selectedEntities(world);
  const res = world.resources.find((r) => r.kind !== "rockblock" && r.amount > 0 && Math.hypot(r.x - x, r.z - z) < 2.2);
  const foe = [...world.units, ...world.buildings].find(
    (e) => e.owner !== "player" && e.hp > 0 && Math.hypot(e.x - x, e.z - z) < 2.4
  );
  for (const e of sel) {
    if (e.kind !== "unit") continue;
    if (foe) issueAttack(world, e, foe);
    else if (res && e.type === "villager") issueGather(world, e, res);
    else if (attackMove) issueAttackMove(world, e, x, z);
    else issueMove(world, e, x, z);
  }
  const bsel = sel.find((e) => e.kind === "building");
  if (bsel && !sel.some((e) => e.kind === "unit")) bsel.rally = { x, z };
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
  return VILLAGER_BUILD_LIST.filter((t) => BUILDINGS[t].age <= age);
}

export { lineX, canPay, BUILDINGS, UNITS };
