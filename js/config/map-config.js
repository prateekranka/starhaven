/** Presentation-only biome colors. Hex is canonical; RGB is derived. */

const BIOME_IDS = ["sand", "dirt", "grass", "rock", "cliff", "void"];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = clone(child);
    return out;
  }
  return value;
}

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertSafeKey(key) {
  if (key === "__proto__" || key === "prototype" || key === "constructor") {
    throw new Error(`unsafe map config key: ${key}`);
  }
}

function rgbFromHex(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export const BIOME_HEX = freeze({
  sand: "#f3d7a0",
  dirt: "#d4a45c",
  grass: "#7a9a4a",
  rock: "#a56a42",
  cliff: "#6a4030",
  void: "#121828",
});

export const BIOME_RGB = freeze(Object.fromEntries(
  BIOME_IDS.map((id) => [id, rgbFromHex(BIOME_HEX[id])])
));

export const MAP_DEFAULTS = freeze({
  biome: Object.fromEntries(BIOME_IDS.map((id) => [id, { color: BIOME_HEX[id] }])),
});

let current = clone(MAP_DEFAULTS);
const listeners = new Set();

function normalisePatch(patch) {
  if (!isRecord(patch)) throw new Error("map config patch must be an object");
  const entries = [];
  for (const rawKey of Object.keys(patch)) {
    assertSafeKey(rawKey);
    const key = rawKey.startsWith("map.") ? rawKey.slice("map.".length) : rawKey;
    assertSafeKey(key);
    let id;
    let value;
    if (key.startsWith("biome.")) {
      const parts = key.split(".");
      if (parts.length !== 3 || parts[2] !== "color") throw new Error(`unknown map config key: ${rawKey}`);
      id = parts[1];
      value = patch[rawKey];
    } else if (key === "biome") {
      if (!isRecord(patch[rawKey])) throw new Error("map biome patch must be an object");
      for (const biomeId of Object.keys(patch[rawKey])) {
        assertSafeKey(biomeId);
        if (!BIOME_IDS.includes(biomeId) || !isRecord(patch[rawKey][biomeId])) throw new Error(`unknown map biome: ${biomeId}`);
        const biomePatch = patch[rawKey][biomeId];
        for (const key of Object.keys(biomePatch)) {
          assertSafeKey(key);
          if (key !== "color") throw new Error(`unknown map config key: biome.${biomeId}.${key}`);
          entries.push([biomeId, biomePatch[key]]);
        }
      }
      continue;
    } else {
      throw new Error(`unknown map config key: ${rawKey}`);
    }
    if (!BIOME_IDS.includes(id)) throw new Error(`unknown map biome: ${id}`);
    entries.push([id, value]);
  }
  for (const [id, value] of entries) {
    if (typeof value !== "string" || !HEX_COLOR.test(value)) throw new Error(`biome.${id}.color must be a #RRGGBB color`);
  }
  return entries;
}

function notify() {
  const snapshot = getMapConfig();
  for (const listener of listeners) listener(snapshot);
}

export function getMapConfig() {
  return clone(current);
}

export function getBiomeHex(id) {
  return current.biome[id]?.color ?? BIOME_HEX[id];
}

export function getBiomeRgb(id) {
  const hex = getBiomeHex(id);
  return hex && HEX_COLOR.test(hex) ? rgbFromHex(hex) : clone(BIOME_RGB[id]);
}

export function applyMapConfigPatch(patch = {}) {
  const entries = normalisePatch(patch);
  const next = clone(current);
  for (const [id, color] of entries) next.biome[id].color = color.toLowerCase();
  current = next;
  notify();
  return getMapConfig();
}

export function resetMapConfig(keys = null) {
  if (keys == null) {
    current = clone(MAP_DEFAULTS);
  } else {
    if (!Array.isArray(keys)) throw new Error("map config reset keys must be an array");
    const next = clone(current);
    for (const rawKey of keys) {
      assertSafeKey(rawKey);
      const key = String(rawKey).startsWith("map.") ? String(rawKey).slice("map.".length) : String(rawKey);
      const parts = key.split(".");
      if (parts.length !== 3 || parts[0] !== "biome" || parts[2] !== "color" || !BIOME_IDS.includes(parts[1])) {
        throw new Error(`unknown map config key: ${rawKey}`);
      }
      next.biome[parts[1]].color = MAP_DEFAULTS.biome[parts[1]].color;
    }
    current = next;
  }
  notify();
  return getMapConfig();
}

export function subscribeMapConfig(listener) {
  if (typeof listener !== "function") throw new Error("map config listener must be a function");
  listeners.add(listener);
  return () => listeners.delete(listener);
}
