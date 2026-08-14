import { bridgeHaptic, bridgeSend, initBridge, isNativeHost } from "./bridge.js";
import { audio } from "./audio/engine.js";

export const SAVE_KEY = "starhaven.bright-frontier.v1";

export const defaultSave = () => ({
  faction: "sunwoven",
  difficulty: "chieftain",
  seed: "",
  settings: {
    music: 0.35,
    sfx: 0.7,
    quality: "ultra",
    reduceMotion: false,
    haptics: true,
    showDebug: false,
  },
});

export function loadSave() {
  try {
    return { ...defaultSave(), ...JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") };
  } catch {
    return defaultSave();
  }
}

export function writeSave(save) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

export const native = isNativeHost();

initBridge();

/** @deprecated Prefer bridgeSend from ./bridge.js */
export function postNative(type, payload = {}) {
  bridgeSend(type, payload);
}

export function beep() {
  audio.playUi();
}

export { audio };

/** @param {number} [ms] @param {string} [kind] */
export function haptic(ms = 10, kind = "select") {
  if (!loadSave().settings.haptics) return;
  bridgeHaptic(kind);
  if (navigator.vibrate) {
    const pattern = kind === "matchEnded" ? [20, 30, 60] : kind === "combatHit" ? 8 : ms;
    navigator.vibrate(pattern);
  }
}

export function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => {
    el.classList.toggle("active", el.dataset.screen === id);
  });
}
