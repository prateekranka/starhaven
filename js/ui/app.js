import { loadSave, writeSave, showScreen, beep, haptic, native, postNative } from "../boot.js";
import { detectDefaultQuality } from "../perf.js";
import { startBackgroundWarm, ensureMatchAssets, matchAssetsReady } from "../cache/assets.js";
import { parseSeed } from "../sim/seed.js";
import { loadMapManifest, populateMapSelect } from "../data/maps.js";
import { renderFactionPicks, renderLoreGrid, DEFAULT_CIV_ID } from "../data/civ-ui.js";
import { getCiv } from "../data/civ-schema.js";
import "../data/civs.js";

/** Non-deterministic seed for blank setup fields (UI only — never in js/sim/). */
function pickRandomSeed() {
  return ((Date.now() ^ ((Math.random() * 0x100000000) | 0)) >>> 0);
}

/** URL ?seed= overrides; typed/saved seed is deterministic; blank → fresh hidden seed. */
function resolveUiSeed(rawSeed) {
  const urlSeed = new URLSearchParams(location.search).get("seed");
  if (urlSeed != null && urlSeed !== "") return parseSeed(urlSeed);
  if (rawSeed != null && rawSeed !== "") return parseSeed(rawSeed);
  return pickRandomSeed();
}

let gameMod = null;
function loadGame() {
  if (!gameMod) gameMod = import("../game/main.js");
  return gameMod;
}

export function initUi() {
  const save = loadSave();
  if (!save.settings.quality || save.settings.quality === "medium") {
    save.settings.quality = detectDefaultQuality();
    writeSave(save);
  }
  applySettingsForm(save);
  const seedInput = document.getElementById("seed-input");
  if (seedInput && save.seed) seedInput.value = save.seed;
  populateMapSelect(document.getElementById("map-select"), save.mapId, (info) => {
    const img = document.getElementById("map-preview-img");
    const blurb = document.getElementById("map-preview-blurb");
    if (blurb) blurb.textContent = info.blurb || "";
    if (img) {
      if (info.preview) {
        img.src = info.preview;
        img.hidden = false;
      } else {
        img.hidden = true;
        img.removeAttribute("src");
      }
    }
  }).catch((err) => {
    console.warn("map manifest load failed", err);
  });
  mountCivScreens(save);
  if (native) document.body.classList.add("native");
  watchCacheWarm();

  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    beep(360, 0.05);
    haptic(8);
    if (action === "title") {
      loadGame().then(({ togglePause, stopMatch }) => {
        togglePause(false);
        stopMatch();
        showScreen("title");
      });
    } else if (action === "skirmish") {
      mountCivScreens(save);
      showScreen("skirmish");
    } else if (action === "factions") {
      renderLoreGrid(document.getElementById("lore-grid"));
      showScreen("factions");
    else if (action === "settings") showScreen("settings");
    else if (action === "tutorial") showScreen("tutorial");
    else if (action === "campaign") {
      playMatch({
        playerFaction: save.faction || DEFAULT_CIV_ID,
        difficulty: "chieftain",
        campaign: true,
        mapId: save.mapId || "bright-mesa",
      });
    } else if (action === "start-skirmish") {
      const faction = document.querySelector(".faction-pick.selected")?.dataset.faction || DEFAULT_CIV_ID;
      const difficulty = document.getElementById("diff-select").value;
      const mapId = document.getElementById("map-select")?.value || "bright-mesa";
      const seedRaw = document.getElementById("seed-input")?.value?.trim();
      save.faction = faction;
      save.difficulty = difficulty;
      save.mapId = mapId;
      if (seedRaw) save.seed = seedRaw;
      writeSave(save);
      playMatch({ playerFaction: faction, difficulty, mapId, seed: seedRaw || save.seed || undefined });
    } else if (action === "start-tutorial") {
      playMatch({ playerFaction: save.faction || DEFAULT_CIV_ID, tutorial: true, difficulty: "settler" });
    }
  });

  mountCivScreens(save);

  document.getElementById("settings-form").addEventListener("change", () => {
    const s = loadSave();
    const f = document.getElementById("settings-form");
    s.settings.music = Number(f.music.value);
    s.settings.sfx = Number(f.sfx.value);
    s.settings.quality = f.quality.value;
    s.settings.reduceMotion = f.reduceMotion.checked;
    s.settings.haptics = f.haptics.checked;
    s.settings.showDebug = f.showDebug.checked;
    writeSave(s);
    postNative("settings", s.settings);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.getElementById("btn-menu")?.click();
  });

  window.StarhavenNative = {
    startSkirmish: (opts) => playMatch(opts || { playerFaction: loadSave().faction }),
    show: showScreen,
    applySettings: (settings) => {
      const s = loadSave();
      s.settings = { ...s.settings, ...settings };
      writeSave(s);
    },
  };

  const params = new URLSearchParams(location.search);
  if (params.get("play") === "1") {
    playMatch({
      playerFaction: params.get("faction") || save.faction || DEFAULT_CIV_ID,
      difficulty: params.get("diff") || save.difficulty || "chieftain",
      tutorial: params.get("tutorial") === "1",
      seed: save.seed || undefined,
    });
  }
}

function mountCivScreens(save) {
  const selected = getCiv(save.faction)?.id || DEFAULT_CIV_ID;
  renderFactionPicks(document.getElementById("faction-picks"), {
    selectedId: selected,
    onSelect: (civId) => {
      const s = loadSave();
      s.faction = civId;
      writeSave(s);
    },
  });
  renderLoreGrid(document.getElementById("lore-grid"));
}


async function playMatch(opts = {}) {
  const seed = resolveUiSeed(opts.seed);
  const matchOpts = { ...opts, seed };
  const veil = document.getElementById("boot-veil");
  const bar = document.getElementById("boot-veil-bar");
  const copy = document.getElementById("boot-veil-copy");
  const already = matchAssetsReady();
  if (!already) {
    veil?.classList.remove("hidden");
    if (copy) copy.textContent = "Loading Bright Mesa";
    if (bar) bar.style.width = "8%";
  }
  try {
    await ensureMatchAssets((done, total) => {
      const pct = total ? Math.max(8, Math.round((done / total) * 100)) : 8;
      if (bar) bar.style.width = `${pct}%`;
      if (copy) copy.textContent = `Caching sprites ${done}/${total}`;
    });
    if (copy) copy.textContent = "Starting match";
    const { startMatch } = await loadGame();
    await startMatch(matchOpts);
  } catch (err) {
    console.error(err);
    if (copy) copy.textContent = "Could not load match assets.";
    return;
  }
  veil?.classList.add("hidden");
}

function watchCacheWarm() {
  const hud = document.getElementById("cache-hud");
  const label = document.getElementById("cache-hud-label");
  const bar = document.getElementById("cache-hud-bar");
  startBackgroundWarm((done, total) => {
    if (!hud) return;
    hud.hidden = false;
    const pct = total ? Math.round((done / total) * 100) : 0;
    if (bar) bar.style.width = `${pct}%`;
    if (label) label.textContent = pct >= 100 ? "Mesa cached" : `Caching mesa ${done}/${total}`;
    if (pct >= 100) setTimeout(() => { hud.hidden = true; }, 1600);
  }).catch((err) => {
    console.warn("asset warm failed", err);
    if (hud) hud.hidden = true;
  });
}

function applySettingsForm(save) {
  const f = document.getElementById("settings-form");
  f.music.value = save.settings.music;
  f.sfx.value = save.settings.sfx;
  f.quality.value = save.settings.quality;
  f.reduceMotion.checked = save.settings.reduceMotion;
  f.haptics.checked = save.settings.haptics;
  f.showDebug.checked = !!save.settings.showDebug;
}

initUi();
