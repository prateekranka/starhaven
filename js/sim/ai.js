import { BUILDINGS, UNITS } from "../data/catalog.js";
import { getCiv } from "../data/civ-schema.js";
import { planAshveinFlankPath } from "./civs/ashvein.js";
import { civMechanics } from "./civs/index.js";
import "./civs/stormveil.js";
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
import { astar } from "./path.js";
import { cellOfQ10, distanceSquaredQ10, secToTicks, TICKS_PER_SEC } from "./fixed.js";

const AI_INTERVAL_TICKS = secToTicks(0.45);
const SCOUT_ORBIT_RADIUS_Q10 = q10FromWorld(16);
const SCOUT_ORBIT_CENTER_Q10 = q10FromWorld(24);

const DEFAULT_AI = {
  villagers: { settler: 8, chieftain: 11, emperor: 14 },
  waveTickSec: { settler: 90, chieftain: 48, emperor: 36 },
  emperorExtraStock: 80,
  buildPriority: ["house", "barracks", "spire", "mill", "workshop"],
  waveArmyMin: { settler: 4, chieftain: 1, emperor: 1 },
  ageThresholds: [
    { age: 2, food: 420, crystal: 180 },
    { age: 3, food: 680, crystal: 360 },
  ],
  gatherPriority: ["food", "wood", "crystal", "ore"],
  barracksAtVillagers: 6,
  minFoodForBarracks: 120,
  minFoodToQueueVillager: 100,
  maxBuildHelpers: 2,
};

export function runAI(world) {
  const owners = world.aiVsAi ? ["player", "enemy"] : ["enemy"];
  for (const owner of owners) runAIForOwner(world, owner);
}

function runAIForOwner(world, owner) {
  const p = world.players[owner];
  if (!p.alive) return;
  world._aiAccTicks = world._aiAccTicks || {};
  world._aiAccTicks[owner] = (world._aiAccTicks[owner] || 0) + 1;
  if (world._aiAccTicks[owner] < AI_INTERVAL_TICKS) return;
  world._aiAccTicks[owner] = 0;

  const ai = { ...DEFAULT_AI, ...getCiv(p.faction)?.ai };
  const diff = world.difficulty || "chieftain";
  const d = {
    villagers: ai.villagers[diff] || ai.villagers.chieftain,
    waveTick: secToTicks(ai.waveTickSec[diff] || ai.waveTickSec.chieftain),
    extra: diff === "emperor" ? ai.emperorExtraStock : 0,
    waveArmyMin: ai.waveArmyMin?.[diff] ?? ai.waveArmyMin?.chieftain ?? 5,
  };

  applyOpeningBoost(world, p, ai, d.extra);

  const villagers = world.units.filter((u) => u.owner === owner && u.type === "villager");
  const tc = world.buildings.find((b) => b.owner === owner && b.type === "towncenter" && isBuilt(b));
  if (!tc) return;

  const headroom = popHeadroom(world, owner);
  const usesAssembly = Boolean(ai.usesAssembly);
  const activeAssemblies = (world.assemblies || []).filter((a) => a.owner === owner).length;
  const canQueueVillager = usesAssembly ? activeAssemblies < 2 : tc.queue.length < 3;
  const hasRax = world.buildings.some((b) => b.owner === owner && b.type === "barracks");
  const villagerStockOk = usesAssembly
    ? p.stock.crystal >= (hasRax ? (ai.minCrystalToQueueVillager ?? 50) : 45)
    : p.stock.food >= (ai.minFoodToQueueVillager || 100);

  if (villagers.length < d.villagers && headroom > 0 && canQueueVillager && villagerStockOk) {
    queueUnit(world, tc, "villager");
  }
  if (headroom <= 1) placeIfMissing(world, owner, "house", tc, 10, ai);

  balanceGather(world, owner, villagers, ai);
  helpBuild(world, owner, villagers, ai);
  if (usesAssembly) helpAssemble(world, owner, villagers);

  tryAgeUps(world, owner, p, ai);

  const foodGate = ai.minFoodForBarracks ?? 240;
  if (villagers.length >= (ai.barracksAtVillagers || 6) && (foodGate <= 0 || p.stock.food >= foodGate)) {
    placeIfMissing(world, owner, "barracks", tc, 10, ai);
  }
  for (const type of ai.buildPriority || DEFAULT_AI.buildPriority) {
    if (type === "house" || type === "barracks") continue;
    if (!hasRax) continue;
    if (p.age >= (BUILDINGS[type]?.age || 1)) placeIfMissing(world, owner, type, tc, 12, ai);
  }

  queueMilitary(world, owner, headroom, usesAssembly, ai);
  waveAttack(world, owner, d.waveTick, d.waveArmyMin, ai);
  orbitScout(world, owner);

  civMechanics(p.faction).runAI(world, p);
}

function applyOpeningBoost(world, p, ai, extra) {
  if (world.t >= TICKS_PER_SEC || !extra) return;
  if (ai.gatherPriority && !ai.gatherPriority.includes("food")) {
    p.stock.crystal += extra;
    p.stock.wood += extra;
    return;
  }
  p.stock.food += extra;
  p.stock.wood += extra;
}

function tryAgeUps(world, owner, p, ai) {
  if (ai.ageCosts) {
    if (p.age === 1 && canPayStock(p.stock, ai.ageCosts[2])) tryAgeUp(world, owner);
    if (p.age === 2 && canPayStock(p.stock, ai.ageCosts[3])) tryAgeUp(world, owner);
    return;
  }
  for (const threshold of ai.ageThresholds || DEFAULT_AI.ageThresholds) {
    if (p.age !== threshold.age - 1) continue;
    if (p.stock.food >= (threshold.food || 0) && p.stock.crystal >= (threshold.crystal || 0) && (threshold.ore == null || p.stock.ore >= threshold.ore)) {
      tryAgeUp(world, owner);
    }
  }
}

function queueMilitary(world, owner, headroom, usesAssembly, _ai) {
  const barracks = world.buildings.filter((b) => b.owner === owner && b.type === "barracks" && isBuilt(b) && civMechanics(b.faction).isBuildingActive(world, b));
  const spire = world.buildings.filter((b) => b.owner === owner && b.type === "spire" && isBuilt(b) && civMechanics(b.faction).isBuildingActive(world, b));
  const shop = world.buildings.filter((b) => b.owner === owner && b.type === "workshop" && isBuilt(b) && civMechanics(b.faction).isBuildingActive(world, b));
  for (const b of barracks) {
    const cap = usesAssembly ? assemblyCount(world, owner, b.id) : b.queue.length;
    if (cap < 3 && headroom > 1) queueUnit(world, b, "guard");
  }
  for (const b of spire) {
    const cap = usesAssembly ? assemblyCount(world, owner, b.id) : b.queue.length;
    if (cap < 1 && headroom > 1) queueUnit(world, b, "archer");
  }
  for (const b of shop) {
    const cap = usesAssembly ? assemblyCount(world, owner, b.id) : b.queue.length;
    if (cap < 1 && headroom > 2) queueUnit(world, b, "siege");
  }
}

function highlandChokeGoal(world) {
  if ((world.mapId || world.map?.id) !== "highland-chokes") return null;
  const chokeZ = (world.seed >>> 0) % 2 === 0 ? 32 : 64;
  const cell = world.CELL;
  return { xQ10: q10FromWorld((48 + 0.5) * cell), zQ10: q10FromWorld((chokeZ + 0.5) * cell) };
}

function issueWaveMove(world, u, xQ10, zQ10) {
  const choke = highlandChokeGoal(world);
  if (!choke) {
    issueAttackMove(world, u, xQ10, zQ10);
    return;
  }
  u.state = "attackmove";
  u.target = null;
  const [sx, sz] = cellOfQ10(u.xQ10, u.zQ10, world.CELL);
  const [gx, gz] = cellOfQ10(xQ10, zQ10, world.CELL);
  const [cx, cz] = cellOfQ10(choke.xQ10, choke.zQ10, world.CELL);
  const nearGoal = distanceSquaredQ10(u, { xQ10, zQ10 }) < q10FromWorld(22) * q10FromWorld(22);
  const crossed = (gx >= cx && sx >= cx - 2) || (gx <= cx && sx <= cx + 2);
  if (nearGoal) {
    issueAttackMove(world, u, xQ10, zQ10);
    return;
  }
  if (crossed) {
    u.path = astar(world.walk, world.N, sx, sz, gx, gz);
    return;
  }
  const toChoke = astar(world.walk, world.N, sx, sz, cx, cz);
  const toGoal = astar(world.walk, world.N, cx, cz, gx, gz);
  const skip = toGoal[0] && toGoal[0][0] === cx && toGoal[0][1] === cz ? 1 : 0;
  u.path = toChoke.concat(toGoal.slice(skip));
}

function waveAttack(world, owner, waveTick, waveArmyMin, ai) {
  const p = world.players[owner];
  const army = world.units.filter((u) => u.owner === owner && u.type !== "villager" && u.type !== "scout" && u.type !== "wagon");
  const foeTc = world.buildings.find((b) => b.owner !== owner && b.type === "towncenter");
  if (!foeTc || army.length < waveArmyMin || world.t <= waveTick || world.t <= p.attackWaveAtTick) return;
  p.attackWaveAtTick = world.t + secToTicks(22);
  const choke = highlandChokeGoal(world);
  const pushTc = world.t >= secToTicks(100);
  const gxQ10 = !choke || pushTc ? foeTc.xQ10 : choke.xQ10;
  const gzQ10 = !choke || pushTc ? foeTc.zQ10 : choke.zQ10;
  for (const u of army) {
    if (!choke && ai.useTunnelFlank) {
      const flank = planAshveinFlankPath(world, u, foeTc.xQ10, foeTc.zQ10);
      if (flank?.length) {
        u.layer = "surface";
        u.path = flank;
        u.state = "attackmove";
        continue;
      }
    }
    issueWaveMove(world, u, gxQ10, gzQ10);
  }
}

function orbitScout(world, owner) {
  if (world.batchSim) return;
  const scout = world.units.find((u) => u.owner === owner && u.type === "scout" && u.state === "idle");
  if (!scout) return;
  const phase = world.t % 720;
  const xOffset = phase < 360 ? q10FromWorld((phase / 360) * 32 - 16) : q10FromWorld(((720 - phase) / 360) * 32 - 16);
  const zOffset = phase < 180 || phase >= 540 ? SCOUT_ORBIT_RADIUS_Q10 : -SCOUT_ORBIT_RADIUS_Q10;
  issueAttackMove(world, scout, SCOUT_ORBIT_CENTER_Q10 + xOffset, SCOUT_ORBIT_CENTER_Q10 + zOffset);
}

function assemblyCount(world, owner, buildingId) {
  return (world.assemblies || []).filter((a) => a.owner === owner && a.buildingId === buildingId).length;
}

const ASSEMBLE_PULL = new Set(["idle", "gather", "gatherwalk", "return"]);

function helpAssemble(world, owner, villagers) {
  for (const site of world.assemblies || []) {
    if (site.owner !== owner) continue;
    if (villagers.filter((v) => v.assemble === site.id).length >= 2) continue;
    const idle = villagers.find((v) => ASSEMBLE_PULL.has(v.state) && !v.assemble);
    if (idle) issueAssemble(world, idle, site);
  }
}

function placeIfMissing(world, owner, type, tc, radius, _ai) {
  const have = world.buildings.filter((b) => b.owner === owner && b.type === type);
  const cap = type === "house" ? 8 : 1;
  if (have.length >= cap) return;
  const spec = BUILDINGS[type];
  const p = world.players[owner];
  if (p.age < spec.age) return;
  const offsets = [
    [4, 0], [0, 4], [-4, 0], [0, -4],
    [6, 0], [0, 6], [-6, 0], [0, -6], [6, 6], [-6, -6],
    [8, 2], [2, 8], [-8, 2], [2, -8],
  ];
  for (const [dx, dz] of offsets) {
    const res = tryPlace(world, owner, type, worldFromQ10(tc.xQ10 + q10FromWorld(dx)), worldFromQ10(tc.zQ10 + q10FromWorld(dz)));
    if (res?.ok) return;
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const dx = world.prng.ai.nextInt(-radius, radius);
    const dz = world.prng.ai.nextInt(-radius, radius);
    const res = tryPlace(world, owner, type, worldFromQ10(tc.xQ10 + q10FromWorld(dx)), worldFromQ10(tc.zQ10 + q10FromWorld(dz)));
    if (res?.ok) return;
  }
}

function gatherJobKind(world, v) {
  if (v.carryKind) return v.carryKind;
  const res = world.byId.get(v.resource);
  return res?.kind || null;
}

function balanceGather(world, owner, villagers, ai) {
  const need = needKind(world.players[owner], ai);
  let assigned = 0;
  for (const v of villagers) {
    if (v.state !== "idle") continue;
    const res = nearestRes(world, v, need);
    if (res) {
      issueGather(world, v, res);
      assigned += 1;
    }
  }
  if (assigned > 0) return;
  const p = world.players[owner];
  const mins = ai.usesAssembly
    ? { food: 0, wood: 55, crystal: 90, ore: 40 }
    : { food: 160, wood: 180, crystal: 80, ore: 40 };
  if ((p.stock[need] || 0) >= (mins[need] || 0)) return;
  const pull = villagers.filter((v) => {
    if (v.state !== "gather" && v.state !== "gatherwalk" && v.state !== "return") return false;
    return gatherJobKind(world, v) !== need;
  });
  for (const v of pull.slice(0, 2)) {
    const res = nearestRes(world, v, need);
    if (res) issueGather(world, v, res);
  }
}

function helpBuild(world, owner, villagers, ai) {
  const site = world.buildings.find((b) => b.owner === owner && !isBuilt(b));
  if (!site) return;
  const maxHelpers = ai.maxBuildHelpers || 2;
  const assigned = villagers.filter((v) => v.build === site.id || v.state === "build" || v.state === "buildwalk").length;
  if (assigned >= maxHelpers) return;
  for (const v of villagers.filter((x) => x.state === "idle" || x.state === "gather").slice(0, maxHelpers - assigned)) {
    issueBuild(world, v, site);
  }
}

function needKind(p, ai) {
  const order = ai.gatherPriority || DEFAULT_AI.gatherPriority;
  const mins = ai.usesAssembly
    ? { food: 0, wood: 55, crystal: 90, ore: 40 }
    : { food: 160, wood: 180, crystal: 80, ore: 40 };
  for (const kind of order) {
    if ((p.stock[kind] || 0) < (mins[kind] || 0)) return kind;
  }
  return order[0] || "food";
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
