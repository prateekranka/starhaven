import { audio } from "./audio/engine.js";

export const SAVE_KEY = "starhaven.bright-frontier.v1";

export const defaultSave = () => ({
  faction: "sunwoven",
  difficulty: "chieftain",
  campaignChapter: 4,
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

export const native = typeof window !== "undefined" && new URLSearchParams(location.search).has("native");

export function postNative(type, payload = {}) {
  const handler = window.webkit?.messageHandlers?.starhaven;
  if (handler) handler.postMessage({ type, ...payload });
}

export function beep() {
  audio.playUi();
}

export { audio };

export function haptic(ms = 10) {
  if (loadSave().settings.haptics && navigator.vibrate) navigator.vibrate(ms);
}

export function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => {
    el.classList.toggle("active", el.dataset.screen === id);
  });
  postNative("screen", { id });
}
