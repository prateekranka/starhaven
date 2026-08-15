import { audio } from "./engine.js";
import { getAudioConfig } from "../config/audio-config.js";
import { loadSave } from "../boot.js";

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
  let combatLevel = 0;

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
      combatLevel = 0;
      audio.stopAllLayers(0.5);
      ensureMatchLayers();
      audio.setLayerGain("day", 0.85, 0.01);
      audio.setLayerGain("combat", 0, 0.01);
    },

    stop() {
      mode = "idle";
      combatLevel = 0;
      audio.stopAllLayers(0.45);
    },

    noteCombat(amount = 0.22) {
      combatLevel = Math.min(1, combatLevel + amount);
    },

    tick(world, view) {
      if (!musicEnabled() || mode !== "match" || !world || world.winner) return;

      const worldCombat = combatFromWorld(world);
      combatLevel = Math.max(combatLevel, worldCombat);
      combatLevel *= 0.965;

      const explore = 1 - combatLevel * 0.62;
      const crossfade = getAudioConfig().matchCrossfadeSeconds;
      audio.setLayerGain("day", explore * 0.88, crossfade);
      audio.setLayerGain("combat", combatLevel * 0.9, crossfade);
    },

    playEnd(won) {
      mode = "end";
      audio.stopLayer("day", 0.6);
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
