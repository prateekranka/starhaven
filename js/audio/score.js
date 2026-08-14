import { N, CELL, lineX } from "../sim/engine.js";
import { audio } from "./engine.js";
import { loadSave } from "../boot.js";

const MAP = N * CELL;
const BRIGHT_BLEND = 11;

function brightLineX(world) {
  return lineX(world);
}

/** 0 = full night bed, 1 = full day bed — smooth across the Bright Line. */
export function dayMixAt(world, x) {
  const dist = brightLineX(world) - x;
  const t = Math.max(0, Math.min(1, (dist + BRIGHT_BLEND * 0.5) / BRIGHT_BLEND));
  return t * t * (3 - 2 * t);
}

function combatFromWorld(world) {
  let n = 0;
  for (const u of world.units) {
    if (u.hp <= 0) continue;
    if (u.target != null || u.state === "attack" || u.state === "attackmove") n += 1;
  }
  for (const p of world.projectiles || []) n += 0.35;
  return Math.min(1, n / 6);
}

export function createScoreDirector() {
  let mode = "idle";
  let combatPulse = 0;

  function musicEnabled() {
    return (loadSave().settings.music ?? 0) > 0;
  }

  function ensureTitle() {
    if (!musicEnabled()) return;
    audio.startLayer("title", "music_title");
    audio.setLayerGain("title", 0.92, 0.8);
  }

  function ensureMatchLayers() {
    if (!musicEnabled()) return;
    audio.startLayer("day", "music_day");
    audio.startLayer("night", "music_night");
    audio.startLayer("combat", "music_combat");
  }

  return {
    startTitle() {
      mode = "title";
      if (!musicEnabled()) {
        audio.stopAllLayers(0.25);
        return;
      }
      audio.stopAllLayers(0.4);
      ensureTitle();
    },

    startMatch() {
      mode = "match";
      combatPulse = 0;
      audio.stopAllLayers(0.5);
      ensureMatchLayers();
      audio.setLayerGain("day", 0.85, 0.01);
      audio.setLayerGain("night", 0, 0.01);
      audio.setLayerGain("combat", 0, 0.01);
    },

    stop() {
      mode = "idle";
      combatPulse = 0;
      audio.stopAllLayers(0.45);
    },

    noteCombat(amount = 0.22) {
      combatPulse = Math.min(1, combatPulse + amount);
    },

    tick(world, view) {
      if (!musicEnabled() || mode !== "match" || !world || world.winner) return;

      const cam = view?.cameraInfo?.() || { x: MAP / 2 };
      const dayMix = dayMixAt(world, cam.x);
      const worldCombat = combatFromWorld(world);
      combatPulse = Math.max(combatPulse, worldCombat);
      combatPulse *= 0.965;

      const explore = 1 - combatPulse * 0.62;
      audio.setLayerGain("day", dayMix * explore * 0.88, 1.6);
      audio.setLayerGain("night", (1 - dayMix) * explore * 0.88, 1.6);
      audio.setLayerGain("combat", combatPulse * 0.9, 0.75);
    },

    playEnd(won) {
      mode = "end";
      audio.stopLayer("day", 0.6);
      audio.stopLayer("night", 0.6);
      audio.stopLayer("combat", 0.45);
      if (!musicEnabled()) return;
      const bed = won ? "music_victory" : "music_defeat";
      const layer = won ? "victory" : "defeat";
      audio.startLayer(layer, bed, { loop: false });
      audio.setLayerGain(layer, won ? 0.95 : 0.82, 0.35);
    },

    refreshVolume() {
      if (!musicEnabled()) {
        audio.stopAllLayers(0.2);
        return;
      }
      audio.applyVolumes();
      if (mode === "title") ensureTitle();
      else if (mode === "match") ensureMatchLayers();
    },
  };
}

export const score = createScoreDirector();

audio.onUnlock = () => {
  if (document.getElementById("screen-title")?.classList.contains("active")) score.startTitle();
};
