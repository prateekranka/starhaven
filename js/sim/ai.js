import { BUILDINGS, UNITS } from "../data/catalog.js";
import {
  queueUnit,
  tryPlace,
  tryAgeUp,
  issueGather,
  issueAttackMove,
  issueAssemble,
  issueBuild,
  isBuilt,
  popHeadroom,
  canPayStock,
  q10FromWorld,
  worldFromQ10,
} from "./engine.js";
import { distanceSquaredQ10, secToTicks, TICKS_PER_SEC } from "./fixed.js";
import { COGFORGED_AI, COGFORGED_AGE_COSTS } from "./civs/cogforged.js";

const DIFF = {
  settler: { villagers: 8, waveTick: secToTicks(140), extra: 0 },
  chieftain: { villagers: 11, waveTick: secToTicks(95), extra: 0 },
  emperor: { villagers: 14, waveTick: secToTicks(70), extra: 80 },
};

const AI_INTERVAL_TICKS = secToTicks(0.45);
const SCOUT_ORBIT_RADIUS_Q10 = q10FromWorld(16);
const SCOUT_ORBIT_CENTER_Q10 = q10FromWorld(24);

export function runAI(world) {
  const p = world.players.enemy;
  if (!p.alive) return;
  world._aiAccTicks = (world._aiAccTicks || 0) + 1;
  if (world._aiAccTicks < AI_INTERVAL_TICKS) return;
  world._aiAccTicks = 0;
  if (p.faction === "cogforged") {
    runCogforgedAI(world);
    return;
  }

  const d = DIFF[world.difficulty] || DIFF.chieftain;
  if (world.t < TICKS_PER_SEC && d.extra) {
    p.stock.food += d.extra;
    p.stock.wood += d.extra;
  }

  const villagers = world.units.filter((u) => u.owner === "enemy" && u.type === "villager");
  const tc = world.buildings.find((b) => b.owner === "enemy" && b.type === "towncenter" && isBuilt(b));
  if (!tc) return;

  const popHeadroomVal = popHeadroom(world, "enemy");
  if (villagers.length < d.villagers && popHeadroomVal > 0 && tc.queue.length < 3) queueUnit(world, tc, "villager");
  if (popHeadroomVal <= 1) placeIfMissing(world, "house", tc, 10);
  balanceGather(world, villagers);
  helpBuild(world, villagers);
  if (p.age === 1 && p.stock.food >= 500 && p.stock.crystal >= 200) tryAgeUp(world, "enemy");
  if (p.age === 2 && p.stock.food >= 800 && p.stock.crystal >= 400) tryAgeUp(world, "enemy");
  if (villagers.length >= 6) placeIfMissing(world, "barracks", tc, 10);
  if (p.age >= 2) {
    placeIfMissing(world, "spire", tc, 12);
    placeIfMissing(world, "mill", tc, 7);
  }
  if (p.age >= 3) placeIfMissing(world, "workshop", tc, 14);

  const barracks = world.buildings.filter((b) => b.owner === "enemy" && b.type === "barracks" && isBuilt(b));
  const spire = world.buildings.filter((b) => b.owner === "enemy" && b.type === "spire" && isBuilt(b));
  const shop = world.buildings.filter((b) => b.owner === "enemy" && b.type === "workshop" && isBuilt(b));
  for (const b of barracks) if (b.queue.length < 2 && popHeadroomVal > 1) queueUnit(world, b, "guard");
  for (const b of spire) if (b.queue.length < 1 && popHeadroomVal > 1) queueUnit(world, b, "archer");
  for (const b of shop) if (b.queue.length < 1 && popHeadroomVal > 2) queueUnit(world, b, "siege");

  waveAttack(world, d.waveTick);
  orbitScout(world);
}

function runCogforgedAI(world) {
  const p = world.players.enemy;
  const diff = world.difficulty || "chieftain";
  const d = {
    villagers: COGFORGED_AI.villagers[diff] || COGFORGED_AI.villagers.chieftain,
    waveTick: secToTicks(COGFORGED_AI.waveTickSec[diff] || COGFORGED_AI.waveTickSec.chieftain),
    extra: diff === "emperor" ? COGFORGED_AI.emperorExtraStock : 0,
  };
  if (world.t < TICKS_PER_SEC && d.extra) {
    p.stock.crystal += d.extra;
    p.stock.wood += d.extra;
  }
  const villagers = world.units.filter((u) => u.owner === "enemy" && u.type === "villager");
  const tc = world.buildings.find((b) => b.owner === "enemy" && b.type === "towncenter" && isBuilt(b));
  if (!tc) return;
  const headroom = popHeadroom(world, "enemy");
  const activeAssemblies = (world.assemblies || []).filter((a) => a.owner === "enemy").length;
  if (villagers.length < d.villagers && headroom > 0 && activeAssemblies < 2) queueUnit(world, tc, "villager");
  if (headroom <= 1) placeIfMissing(world, "house", tc, 10);
  for (const v of villagers) {
    if (v.state !== "idle") continue;
    const res = nearestRes(world, v, needKindCogforged(p));
    if (res) issueGather(world, v, res);
  }
  helpAssemble(world, villagers);
  if (p.age === 1 && canPayStock(p.stock, COGFORGED_AGE_COSTS[2])) tryAgeUp(world, "enemy");
  if (p.age === 2 && canPayStock(p.stock, COGFORGED_AGE_COSTS[3])) tryAgeUp(world, "enemy");
  if (villagers.length >= 5) placeIfMissing(world, "barracks", tc, 10);
  if (p.age >= 2) {
    placeIfMissing(world, "lumber", tc, 8);
    placeIfMissing(world, "mine", tc, 8);
    placeIfMissing(world, "spire", tc, 12);
  }
  if (p.age >= 3) placeIfMissing(world, "workshop", tc, 14);
  const barracks = world.buildings.filter((b) => b.owner === "enemy" && b.type === "barracks" && isBuilt(b) && b.powered);
  const spire = world.buildings.filter((b) => b.owner === "enemy" && b.type === "spire" && isBuilt(b) && b.powered);
  const shop = world.buildings.filter((b) => b.owner === "enemy" && b.type === "workshop" && isBuilt(b) && b.powered);
  for (const b of barracks) if (assemblyCount(world, "enemy", b.id) < 2 && headroom > 1) queueUnit(world, b, "guard");
  for (const b of spire) if (assemblyCount(world, "enemy", b.id) < 1 && headroom > 1) queueUnit(world, b, "archer");
  for (const b of shop) if (assemblyCount(world, "enemy", b.id) < 1 && headroom > 2) queueUnit(world, b, "siege");
  waveAttack(world, d.waveTick);
  orbitScout(world);
}

function waveAttack(world, waveTick) {
  const p = world.players.enemy;
  const army = world.units.filter((u) => u.owner === "enemy" && u.type !== "villager" && u.type !== "scout");
  const ptc = world.buildings.find((b) => b.owner === "player" && b.type === "towncenter");
  if (ptc && army.length >= (world.difficulty === "settler" ? 10 : 6) && world.t > waveTick && world.t > p.attackWaveAtTick) {
    p.attackWaveAtTick = world.t + secToTicks(55);
    for (const u of army) issueAttackMove(world, u, ptc.xQ10, ptc.zQ10);
  }
}

function orbitScout(world) {
  const scout = world.units.find((u) => u.owner === "enemy" && u.type === "scout" && u.state === "idle");
  if (!scout) return;
  const phase = world.t % 720;
  const xOffset = phase < 360 ? q10FromWorld((phase / 360) * 32 - 16) : q10FromWorld(((720 - phase) / 360) * 32 - 16);
  const zOffset = phase < 180 || phase >= 540 ? SCOUT_ORBIT_RADIUS_Q10 : -SCOUT_ORBIT_RADIUS_Q10;
  issueAttackMove(world, scout, SCOUT_ORBIT_CENTER_Q10 + xOffset, SCOUT_ORBIT_CENTER_Q10 + zOffset);
}

function assemblyCount(world, owner, buildingId) {
  return (world.assemblies || []).filter((a) => a.owner === owner && a.buildingId === buildingId).length;
}

function helpAssemble(world, villagers) {
  for (const site of world.assemblies || []) {
    if (site.owner !== "enemy") continue;
    if (villagers.filter((v) => v.assemble === site.id).length >= 2) continue;
    const idle = villagers.find((v) => (v.state === "idle" || v.state === "gather") && !v.assemble);
    if (idle) issueAssemble(world, idle, site);
  }
}

function placeIfMissing(world, type, tc, radius) {
  const have = world.buildings.filter((b) => b.owner === "enemy" && b.type === type);
  if (have.length >= (type === "house" ? 8 : 1)) return;
  if (world.players.enemy.age < BUILDINGS[type].age) return;
  const dx = world.prng.ai.nextInt(-radius, radius);
  const dz = world.prng.ai.nextInt(-radius, radius);
  tryPlace(world, "enemy", type, worldFromQ10(tc.xQ10 + q10FromWorld(dx)), worldFromQ10(tc.zQ10 + q10FromWorld(dz)));
}

function balanceGather(world, villagers) {
  const need = needKind(world.players.enemy);
  for (const v of villagers) {
    if (v.state !== "idle") continue;
    const res = nearestRes(world, v, need);
    if (res) issueGather(world, v, res);
  }
}

function helpBuild(world, villagers) {
  const site = world.buildings.find((b) => b.owner === "enemy" && !isBuilt(b));
  if (!site) return;
  for (const v of villagers.filter((x) => x.state === "idle" || x.state === "gather" || x.state === "gatherwalk").slice(0, 3)) {
    issueBuild(world, v, site);
  }
}

function needKind(p) {
  if (p.stock.food < 180) return "food";
  if (p.stock.wood < 160) return "wood";
  if (p.stock.crystal < 80) return "crystal";
  if (p.stock.ore < 40) return "ore";
  return "food";
}

function needKindCogforged(p) {
  if (p.stock.wood < 160) return "wood";
  if (p.stock.crystal < 90) return "crystal";
  if (p.stock.ore < 50) return "ore";
  return "wood";
}

function nearestRes(world, u, kind) {
  let best = null;
  let bd = 0x7fffffff;
  for (const r of world.resources) {
    if (r.kind !== kind || r.amount <= 0) continue;
    const d = distanceSquaredQ10(u, r);
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  return best;
}

void UNITS;
