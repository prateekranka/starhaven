/**
 * Presentation-only renderer defaults and a small live configuration store.
 *
 * These values never enter the simulation state. They affect only the WebGL
 * presentation and can therefore change without changing checksums or replays.
 */

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const CONFIG_KEYS = new Set([
  "exposure",
  "background",
  "sunColor",
  "hemiSkyColor",
  "hemiGroundColor",
  "sunIntensity",
  "hemiIntensity",
  "fogColor",
  "fogNear",
  "fogFar",
  "genericGlowFactor",
  "sunPosition",
]);
const SUN_POSITION_KEYS = new Set(["x", "y", "z"]);

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
    throw new Error(`unsafe render config key: ${key}`);
  }
}

function assertNumber(value, key, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${key} must be a finite number in [${min}, ${max}]`);
  }
}

export const RENDER_DEFAULTS = freeze({
  exposure: 1.04,
  background: "#6eb4e8",
  sunColor: "#fff3d0",
  hemiSkyColor: "#d8ecff",
  hemiGroundColor: "#6a4a28",
  sunIntensity: 1.05,
  hemiIntensity: 0.95,
  fogColor: "#7eb6e8",
  fogNear: 110,
  fogFar: 240,
  genericGlowFactor: 0.30,
  sunPosition: freeze({ x: 40, y: 55, z: 10 }),
});

let current = clone(RENDER_DEFAULTS);
const listeners = new Set();

function validateSunPosition(value) {
  if (!isRecord(value)) throw new Error("sunPosition must be an object");
  for (const key of Object.keys(value)) {
    assertSafeKey(key);
    if (!SUN_POSITION_KEYS.has(key)) throw new Error(`unknown render config key: sunPosition.${key}`);
    assertNumber(value[key], `sunPosition.${key}`, -1000, 1000);
  }
  for (const key of SUN_POSITION_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) throw new Error(`sunPosition.${key} is required`);
  }
}

function validatePatch(patch) {
  if (!isRecord(patch)) throw new Error("render config patch must be an object");
  const normalised = {};
  for (const rawKey of Object.keys(patch)) {
    assertSafeKey(rawKey);
    const key = rawKey.startsWith("render.") ? rawKey.slice("render.".length) : rawKey;
    assertSafeKey(key);
    if (!CONFIG_KEYS.has(key)) throw new Error(`unknown render config key: ${key}`);
    const value = patch[rawKey];
    normalised[key] = value;
    if (key === "sunPosition") {
      validateSunPosition(value);
    } else if (key.endsWith("Color") || key === "background" || key === "fogColor") {
      if (typeof value !== "string" || !HEX_COLOR.test(value)) throw new Error(`${key} must be a #RRGGBB color`);
    } else if (key === "exposure") {
      assertNumber(value, key, 0, 4);
    } else if (key === "sunIntensity" || key === "hemiIntensity") {
      assertNumber(value, key, 0, 4);
    } else if (key === "genericGlowFactor") {
      assertNumber(value, key, 0, 1);
    } else if (key === "fogNear") {
      assertNumber(value, key, 0, 5000);
    } else if (key === "fogFar") {
      assertNumber(value, key, 1, 5000);
    }
  }
  const next = { ...current, ...clone(normalised) };
  if (!(next.fogFar > next.fogNear)) throw new Error("fogFar must be greater than fogNear");
  return normalised;
}

function notify() {
  const snapshot = getRenderConfig();
  for (const listener of listeners) listener(snapshot);
}

export function getRenderConfig() {
  return clone(current);
}

export function applyRenderConfigPatch(patch = {}) {
  const normalised = validatePatch(patch);
  current = { ...current, ...clone(normalised) };
  notify();
  return getRenderConfig();
}

export function resetRenderConfig(keys = null) {
  if (keys == null) {
    current = clone(RENDER_DEFAULTS);
  } else {
    if (!Array.isArray(keys)) throw new Error("render config reset keys must be an array");
    const next = { ...current };
    for (const rawKey of keys) {
      assertSafeKey(rawKey);
      const key = rawKey.startsWith("render.") ? rawKey.slice("render.".length) : rawKey;
      assertSafeKey(key);
      if (!CONFIG_KEYS.has(key)) throw new Error(`unknown render config key: ${rawKey}`);
      next[key] = clone(RENDER_DEFAULTS[key]);
    }
    current = next;
  }
  notify();
  return getRenderConfig();
}

export function subscribeRenderConfig(listener) {
  if (typeof listener !== "function") throw new Error("render config listener must be a function");
  listeners.add(listener);
  return () => listeners.delete(listener);
}
