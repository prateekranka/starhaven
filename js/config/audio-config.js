/** Presentation-only audio defaults. */

const CONFIG_KEYS = new Set(["musicVolumeScale", "sfxVolumeScale", "matchCrossfadeSeconds"]);

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
    throw new Error(`unsafe audio config key: ${key}`);
  }
}

function assertNumber(value, key, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${key} must be a finite number in [${min}, ${max}]`);
  }
}

export const AUDIO_DEFAULTS = freeze({
  musicVolumeScale: 0.35,
  sfxVolumeScale: 0.70,
  matchCrossfadeSeconds: 1.6,
});

let current = clone(AUDIO_DEFAULTS);
const listeners = new Set();

function validatePatch(patch) {
  if (!isRecord(patch)) throw new Error("audio config patch must be an object");
  const normalised = {};
  for (const rawKey of Object.keys(patch)) {
    assertSafeKey(rawKey);
    const key = rawKey.startsWith("audio.") ? rawKey.slice("audio.".length) : rawKey;
    assertSafeKey(key);
    if (!CONFIG_KEYS.has(key)) throw new Error(`unknown audio config key: ${key}`);
    normalised[key] = patch[rawKey];
    if (key === "musicVolumeScale" || key === "sfxVolumeScale") assertNumber(normalised[key], key, 0, 1);
    else assertNumber(normalised[key], key, 0.05, 10);
  }
  return normalised;
}

function notify() {
  const snapshot = getAudioConfig();
  for (const listener of listeners) listener(snapshot);
}

export function getAudioConfig() {
  return clone(current);
}

export function applyAudioConfigPatch(patch = {}) {
  const normalised = validatePatch(patch);
  current = { ...current, ...clone(normalised) };
  notify();
  return getAudioConfig();
}

export function resetAudioConfig(keys = null) {
  if (keys == null) {
    current = clone(AUDIO_DEFAULTS);
  } else {
    if (!Array.isArray(keys)) throw new Error("audio config reset keys must be an array");
    const next = { ...current };
    for (const rawKey of keys) {
      assertSafeKey(rawKey);
      const key = rawKey.startsWith("audio.") ? rawKey.slice("audio.".length) : rawKey;
      assertSafeKey(key);
      if (!CONFIG_KEYS.has(key)) throw new Error(`unknown audio config key: ${rawKey}`);
      next[key] = clone(AUDIO_DEFAULTS[key]);
    }
    current = next;
  }
  notify();
  return getAudioConfig();
}

export function subscribeAudioConfig(listener) {
  if (typeof listener !== "function") throw new Error("audio config listener must be a function");
  listeners.add(listener);
  return () => listeners.delete(listener);
}
