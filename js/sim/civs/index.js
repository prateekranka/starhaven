/**
 * Per-civ simulation hooks. Default passthrough keeps Sunwoven/Gravemark unchanged.
 */

const DEFAULT_MECHANICS = {
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
