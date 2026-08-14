import { BUILDINGS, UNITS } from "../data/catalog.js";
import { ASHVEIN_ID, planAshveinFlankPath } from "./civs/ashvein.js";
import {
  queueUnit,
  tryPlace,
  tryAgeUp,
  issueGather,
  issueAttackMove,
  issueBuild,
  q10FromWorld,
  worldFromQ10,
  isBuilt,
} from "./engine.js";
import { distanceSquaredQ10, secToTicks, TICKS_PER_SEC } from "./fixed.js";

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

  const d = DIFF[world.difficulty] || DIFF.chieftain;
  if (world.t < TICKS_PER_SEC && d.extra) {
    p.stock.food += d.extra;
    p.stock.wood += d.extra;
  }

  const villagers = world.units.filter((u) => u.owner === "enemy" && u.type === "villager");
  const tc = world.buildings.find((b) => b.owner === "enemy" && b.type === "towncenter" && isBuilt(b));
  if (!tc) return;

  const popHeadroom = p.popCap - p.pop;
  if (villagers.length < d.villagers && popHeadroom > 0 && tc.queue.length < 3) {
    queueUnit(world, tc, "villager");
  }

  if (popHeadroom <= 1) {
    placeIfMissing(world, "house", tc, 10);
  }

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
  for (const b of barracks) if (b.queue.length < 2 && popHeadroom > 1) queueUnit(world, b, "guard");
  for (const b of spire) if (b.queue.length < 1 && popHeadroom > 1) queueUnit(world, b, "archer");
  for (const b of shop) if (b.queue.length < 1 && popHeadroom > 2) queueUnit(world, b, "siege");

  const army = world.units.filter((u) => u.owner === "enemy" && u.type !== "villager" && u.type !== "scout");
  const ptc = world.buildings.find((b) => b.owner === "player" && b.type === "towncenter");
  if (ptc && army.length >= (world.difficulty === "settler" ? 10 : 6) && world.t > d.waveTick) {
    if (world.t > p.attackWaveAtTick) {
      p.attackWaveAtTick = world.t + secToTicks(55);
      for (const u of army) {
        if (p.faction === ASHVEIN_ID) {
          const flank = planAshveinFlankPath(world, u, ptc.xQ10, ptc.zQ10);
          if (flank?.length) {
            u.layer = "surface";
            u.path = flank;
            u.state = "attackmove";
            continue;
          }
        }
        issueAttackMove(world, u, ptc.xQ10, ptc.zQ10);
      }
    }
  }

  const scout = world.units.find((u) => u.owner === "enemy" && u.type === "scout" && u.state === "idle");
  if (scout) {
    const phase = world.t % 720;
    const xOffset = phase < 360 ? q10FromWorld((phase / 360) * 32 - 16) : q10FromWorld(((720 - phase) / 360) * 32 - 16);
    const zOffset = phase < 180 || phase >= 540 ? SCOUT_ORBIT_RADIUS_Q10 : -SCOUT_ORBIT_RADIUS_Q10;
    issueAttackMove(world, scout, SCOUT_ORBIT_CENTER_Q10 + xOffset, SCOUT_ORBIT_CENTER_Q10 + zOffset);
  }
}

function placeIfMissing(world, type, tc, radius) {
  const have = world.buildings.filter((b) => b.owner === "enemy" && b.type === type);
  const cap = type === "house" ? 8 : 1;
  if (have.length >= cap) return;
  const spec = BUILDINGS[type];
  const p = world.players.enemy;
  if (p.age < spec.age) return;
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
  const helpers = villagers.filter((v) => v.state === "idle" || v.state === "gather" || v.state === "gatherwalk").slice(0, 3);
  for (const v of helpers) issueBuild(world, v, site);
}

function needKind(p) {
  if (p.stock.food < 180) return "food";
  if (p.stock.wood < 160) return "wood";
  if (p.stock.crystal < 80) return "crystal";
  if (p.stock.ore < 40) return "ore";
  return "food";
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
