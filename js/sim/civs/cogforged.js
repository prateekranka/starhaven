/**
 * Cogforged Assembly — no food, on-site assembly, power grid.
 */

import { UNITS } from "../../data/catalog.js";
import { isBuilt } from "../fixed.js";
import { registerCivMechanics } from "./index.js";

export const COGFORGED_AGE_COSTS = {
  2: { crystal: 220 },
  3: { crystal: 450, ore: 200 },
};

export const COGFORGED_AI = {
  villagers: { settler: 6, chieftain: 7, emperor: 9 },
  waveTickSec: { settler: 90, chieftain: 48, emperor: 36 },
  emperorExtraStock: 75,
  buildPriority: ["house", "barracks", "mine", "lumber", "workshop", "spire", "den"],
  waveArmyMin: { settler: 5, chieftain: 1, emperor: 1 },
  ageCosts: COGFORGED_AGE_COSTS,
  gatherPriority: ["crystal", "wood", "ore"],
  usesAssembly: true,
  barracksAtVillagers: 5,
  minFoodToQueueVillager: 0,
  minCrystalToQueueVillager: 50,
  minFoodForBarracks: 0,
};

const UNIT_COSTS = {
  villager: { crystal: 45 },
  scout: { crystal: 70 },
  guard: { wood: 35, crystal: 25 },
  archer: { wood: 45, crystal: 40 },
  strider: { crystal: 85, ore: 35 },
  siege: { wood: 130, ore: 90, crystal: 45 },
};

function stripFood(cost) {
  const next = { ...cost };
  delete next.food;
  return next;
}

function buildingsTouch(a, b) {
  // AI placeIfMissing uses world offsets of 6 around a size-4 TC. Allow a
  // 2-cell gap so production buildings still join the foundry grid.
  const slack = 2;
  const ax2 = a.cx + a.size + slack;
  const az2 = a.cz + a.size + slack;
  const bx2 = b.cx + b.size + slack;
  const bz2 = b.cz + b.size + slack;
  return a.cx <= bx2 && ax2 >= b.cx && a.cz <= bz2 && az2 >= b.cz;
}

function recomputePowerGrid(world, owner) {
  const built = world.buildings.filter((b) => b.owner === owner && isBuilt(b));
  for (const b of built) b.powered = false;
  const tc = built.find((b) => b.type === "towncenter");
  if (!tc) return;
  tc.powered = true;
  const queue = [tc];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    for (const other of built) {
      if (other.powered) continue;
      if (buildingsTouch(cur, other)) {
        other.powered = true;
        queue.push(other);
      }
    }
  }
}

export const COGFORGED_MECHANICS = {
  usesFood: false,
  usesTrainingQueue: false,
  usesPowerGrid: true,

  filterGatherKind(_owner, kind) {
    return kind === "food" ? null : kind;
  },

  adjustStartingStock(stock) {
    stock.food = 0;
    stock.crystal = Math.max(stock.crystal, 240);
    stock.wood = Math.max(stock.wood, 220);
    return stock;
  },

  resolveUnitCost(type, cost) {
    return UNIT_COSTS[type] ? { ...UNIT_COSTS[type] } : stripFood(cost);
  },

  resolveBuildingCost(_type, cost) {
    return stripFood(cost);
  },

  resolveAgeCost(nextAge, cost) {
    return COGFORGED_AGE_COSTS[nextAge.id] ? { ...COGFORGED_AGE_COSTS[nextAge.id] } : stripFood(cost);
  },

  tick(world, owner) {
    recomputePowerGrid(world, owner);
  },

  isBuildingActive(_world, building) {
    return building.powered !== false;
  },

  tickAssemblies(world) {
    if (!world.assemblies?.length) return;
    for (const site of world.assemblies) {
      const b = world.buildings.find((x) => x.id === site.buildingId);
      if (!b || !isBuilt(b) || b.powered === false) continue;
      const workers = world.units.filter((u) => u.assemble === site.id && u.state === "assemble");
      if (!workers.length) continue;
      site.buildTicks += 1;
    }
  },

  tickUnit(world, u) {
    if (u.state !== "assemble" && u.state !== "assemblewalk") return;
    const site = world.assemblies?.find((s) => s.id === u.assemble);
    if (!site) {
      u.state = "idle";
      u.assemble = null;
      return;
    }
    const b = world.buildings.find((x) => x.id === site.buildingId);
    if (!b || b.powered === false) {
      u.state = "idle";
      u.assemble = null;
    }
  },

  assemblyPop(world, owner) {
    if (!world.assemblies) return 0;
    let used = 0;
    for (const site of world.assemblies) {
      if (site.owner !== owner) continue;
      used += UNITS[site.type]?.pop || 0;
    }
    return used;
  },

  villagerBuildList(list) {
    return list.filter((t) => t !== "mill");
  },
};

registerCivMechanics("cogforged", COGFORGED_MECHANICS);
