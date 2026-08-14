/**
 * Civ definition schema and lookup helpers.
 *
 * Each civ exports: identity, roster, statOverrides, techs, buffs, names,
 * sprites, ai, and an optional renderKey for the renderer asset bucket.
 */

const DEFAULT_BUFF = { speed: 1000, dmg: 1000, armor: 1000 };

/** @type {Record<string, import("./civs.js").CivDefinition>} */
const registry = {};

export function registerCiv(civ) {
  registry[civ.id] = civ;
}

export function getCiv(id) {
  return registry[id] || null;
}

export function listPlayableCivs({ qa = false } = {}) {
  return Object.values(registry).filter((c) => {
    if (c.qaOnly && !qa) return false;
    return !c.hidden;
  });
}

export const DEFAULT_CIV_ID = "sunwoven";

export function opponentCivId(playerId) {
  const pool = listPlayableCivs({ qa: playerId === "qa-stub" });
  const other = pool.find((c) => c.id !== playerId);
  if (other) return other.id;
  return playerId === "sunwoven" ? "gravemark" : "sunwoven";
}

export function civRenderKey(civId) {
  const civ = getCiv(civId);
  return civ?.renderKey || civId;
}

export function civDisplayName(civId, type, kind = "unit") {
  const civ = getCiv(civId);
  if (!civ) return type;
  const bucket = kind === "unit" ? civ.names.units : civ.names.buildings;
  return bucket[type] || type;
}

export function civBuff(civId, inLight) {
  const civ = getCiv(civId);
  if (!civ?.buffs) return DEFAULT_BUFF;
  return inLight ? civ.buffs.inLight : civ.buffs.inDark;
}

export function civBuildingSprite(civId, buildingType) {
  const civ = getCiv(civId);
  if (!civ) return null;
  return civ.sprites.buildings[buildingType] || civ.sprites.buildings.house;
}

export function civUnitSpriteSpec(civId, unitType) {
  const civ = getCiv(civId);
  if (!civ) return null;
  const spec = civ.sprites.units[unitType] || civ.sprites.units.default;
  return { kind: spec.kind, sheet: spec.sheet, scale: spec.scale, southFirst: spec.southFirst };
}

export function civSelectionPortrait(civId, entity) {
  const civ = getCiv(civId);
  if (!civ) return null;
  if (entity.kind === "building") {
    return civBuildingSprite(civId, entity.type);
  }
  const unitSpec = civ.sprites.units[entity.type] || civ.sprites.units.default;
  if (unitSpec.kind === "strider") return civ.sprites.strider;
  if (unitSpec.kind === "siege") return civ.sprites.siege;
  return civ.sprites.portrait;
}

export function civBuildThumb(civId, buildingType) {
  return civBuildingSprite(civId, buildingType);
}

/** Temporary shim — issue #23 removes this alias. */
export function displayName(type, faction, kind = "unit") {
  return civDisplayName(faction, type, kind);
}
