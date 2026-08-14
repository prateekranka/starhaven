/**
 * Per-civ simulation hooks. Default passthrough keeps Sunwoven/Gravemark unchanged.
 */

const DEFAULT_MECHANICS = {
  usesFood: true,
  brightLineImmune: false,
  usesTrainingQueue: true,
  usesPowerGrid: false,
  filterGatherKind(_owner, kind) {
    return kind;
  },
  adjustStartingStock(stock) {
    return stock;
  },
  resolveUnitCost(_type, cost) {
    return cost;
  },
  resolveBuildingCost(_type, cost) {
    return cost;
  },
  resolveAgeCost(_nextAge, cost) {
    return cost;
  },
  tick(_world, _owner) {},
  isBuildingActive(_world, building) {
    return building.powered !== false;
  },
  tickAssemblies(_world) {},
  tickUnit(_world, _unit) {},
  assemblyPop(_world, _owner) {
    return 0;
  },
  villagerBuildList(list) {
    return list;
  },
  runAI(_world, _player) {},
};

/** @type {Record<string, typeof DEFAULT_MECHANICS>} */
const registry = {};

export function registerCivMechanics(civId, mechanics) {
  registry[civId] = { ...DEFAULT_MECHANICS, ...mechanics };
}

export function civMechanics(civId) {
  return registry[civId] || DEFAULT_MECHANICS;
}

export function resolveUnitCost(civId, type, baseCost) {
  return civMechanics(civId).resolveUnitCost(type, baseCost);
}

export function resolveBuildingCost(civId, type, baseCost) {
  return civMechanics(civId).resolveBuildingCost(type, baseCost);
}

export function resolveAgeCost(civId, nextAge, baseCost) {
  return civMechanics(civId).resolveAgeCost(nextAge, baseCost);
}
