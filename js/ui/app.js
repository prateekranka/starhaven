import { loadSave, writeSave, showScreen, beep, haptic, native, postNative } from "../boot.js";
import { detectDefaultQuality } from "../perf.js";
import { startBackgroundWarm, ensureMatchAssets, matchAssetsReady } from "../cache/assets.js";
import { parseSeed } from "../sim/seed.js";
import { populateMapSelect } from "../data/maps.js";
import { initKit, bindSlider, bindToggle, bindDropdown } from "./kit.js";
import { initTitleVista } from "./title-vista.js";

/** Non-deterministic seed for blank setup fields (UI only — never in js/sim/). */
function pickRandomSeed() {
  return ((Date.now() ^ ((Math.random() * 0x100000000) | 0)) >>> 0);
}

/** URL ?seed= overrides; leftover save.seed ignored when the (hidden) field is blank. */
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
function dropdownValue(id) {
  const root = document.getElementById(id);
  return root?.querySelector('input[type="hidden"]')?.value || root?.dataset.value || "";
}
function initKitGallery() {
  const s = document.getElementById("screen-kit");
  if (!s) return;
  initKit(s);
  bindDropdown(document.getElementById("kit-dropdown"));
  document.getElementById("kit-open-modal")?.addEventListener("click", () => document.getElementById("kit-modal")?.classList.remove("hidden"));
  document.getElementById("kit-close-modal")?.addEventListener("click", () => document.getElementById("kit-modal")?.classList.add("hidden"));
}

export function initUi() {
  const save = loadSave();
  if (!save.settings.quality || save.settings.quality === "medium") {
    save.settings.quality = detectDefaultQuality();
    writeSave(save);
  }
  applySettingsForm(save);
  initKit(document);
  initTitleVista();
  initPauseSettings();
  populateMapSelect(document.getElementById("map-select"), save.mapId)
    .then((id) => bindDropdown(document.getElementById("map-select"), { value: id || "bright-mesa" }))
    .catch((err) => {
      console.warn("map manifest load failed", err);
    });
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
        document.getElementById("results-modal")?.classList.add("hidden");
        document.body.classList.remove("match-paused");
        showScreen("title");
      });
    } else if (action === "skirmish") showScreen("skirmish");
    else if (action === "factions") showScreen("factions");
    else if (action === "settings") showScreen("settings");
    else if (action === "tutorial") showScreen("tutorial");
    else if (action === "campaign") {
      playMatch({
        playerFaction: save.faction || "sunwoven",
        difficulty: "chieftain",
        campaign: true,
        mapId: save.mapId || "bright-mesa",
      });
    } else if (action === "start-skirmish") {
      const faction = document.querySelector(".faction-pick.selected")?.dataset.faction || "sunwoven";
      const difficulty = dropdownValue("diff-select") || "chieftain";
      const mapId = dropdownValue("map-select") || "bright-mesa";
      save.faction = faction;
      save.difficulty = difficulty;
      save.mapId = mapId;
      writeSave(save);
      playMatch({ playerFaction: faction, difficulty, mapId });
    } else if (action === "start-tutorial") {
      playMatch({ playerFaction: save.faction || "sunwoven", tutorial: true, difficulty: "settler" });
    } else if (action === "pause-abandon-confirm") {
      loadGame().then(({ togglePause, stopMatch }) => {
        togglePause(false);
        stopMatch();
        showScreen("title");
      });
    }
  });

  document.querySelectorAll(".faction-pick").forEach((el) => {
    el.addEventListener("click", () => {
      document.querySelectorAll(".faction-pick").forEach((x) => x.classList.remove("selected"));
      el.classList.add("selected");
      save.faction = el.dataset.faction;
      writeSave(save);
    });
  });

  document.getElementById("settings-form").addEventListener("change", onSettingsChange);
  document.getElementById("pause-settings-form")?.addEventListener("change", onSettingsChange);

  document.getElementById("pause-settings-btn")?.addEventListener("click", () => {
    document.getElementById("pause-menu")?.classList.add("hidden");
    document.getElementById("pause-settings-panel")?.classList.remove("hidden");
  });
  document.getElementById("pause-settings-back")?.addEventListener("click", () => {
    document.getElementById("pause-settings-panel")?.classList.add("hidden");
    document.getElementById("pause-menu")?.classList.remove("hidden");
  });
  document.getElementById("pause-abandon-btn")?.addEventListener("click", () => {
    document.getElementById("pause-menu")?.classList.add("hidden");
    document.getElementById("pause-abandon-panel")?.classList.remove("hidden");
  });
  document.getElementById("pause-abandon-cancel")?.addEventListener("click", () => {
    document.getElementById("pause-abandon-panel")?.classList.add("hidden");
    document.getElementById("pause-menu")?.classList.remove("hidden");
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const pause = document.getElementById("pause-modal");
      if (pause && !pause.classList.contains("hidden")) {
        if (!document.getElementById("pause-settings-panel")?.classList.contains("hidden")) {
          document.getElementById("pause-settings-back")?.click();
        } else if (!document.getElementById("pause-abandon-panel")?.classList.contains("hidden")) {
          document.getElementById("pause-abandon-cancel")?.click();
        } else {
          document.getElementById("resume-btn")?.click();
        }
        return;
      }
      document.getElementById("btn-menu")?.click();
    }
  });

  window.StarhavenNative = {
    startSkirmish: (opts) => playMatch(opts || { playerFaction: loadSave().faction }),
    show: showScreen,
    applySettings: (settings) => {
      const s = loadSave();
      s.settings = { ...s.settings, ...settings };
      writeSave(s);
      applySettingsForm(s);
    },
  };

  const params = new URLSearchParams(location.search);
  initKitGallery();
  if (params.get("kit") === "1") showScreen("kit");
  if (params.get("play") === "1") {
    playMatch({
      playerFaction: params.get("faction") || save.faction || "sunwoven",
      difficulty: params.get("diff") || save.difficulty || "chieftain",
      tutorial: params.get("tutorial") === "1",
    });
  }
}

function onSettingsChange() {
  const s = loadSave();
  for (const formId of ["settings-form", "pause-settings-form"]) {
    const f = document.getElementById(formId);
    if (!f) continue;
    s.settings.music = Number(f.music.value);
    s.settings.sfx = Number(f.sfx.value);
    s.settings.quality = f.quality.value;
    s.settings.reduceMotion = f.reduceMotion.checked;
    s.settings.haptics = f.haptics.checked;
    s.settings.showDebug = f.showDebug.checked;
  }
  writeSave(s);
  applySettingsForm(s);
  postNative("settings", s.settings);
  loadGame().then(({ applyLiveSettings }) => applyLiveSettings?.(s.settings));
}

function initPauseSettings() {
  const panel = document.getElementById("pause-settings-form");
  if (!panel) return;
  panel.querySelectorAll(".ui-slider").forEach((el) => bindSlider(el));
  panel.querySelectorAll(".ui-toggle").forEach((el) => bindToggle(el));
  panel.querySelectorAll(".ui-dropdown").forEach((el) => bindDropdown(el));
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
  for (const formId of ["settings-form", "pause-settings-form"]) {
    const f = document.getElementById(formId);
    if (!f) continue;
    if (f.music) f.music.value = save.settings.music;
    if (f.sfx) f.sfx.value = save.settings.sfx;
    if (f.quality) f.quality.value = save.settings.quality;
    if (f.reduceMotion) f.reduceMotion.checked = save.settings.reduceMotion;
    if (f.haptics) f.haptics.checked = save.settings.haptics;
    if (f.showDebug) f.showDebug.checked = !!save.settings.showDebug;
    f.querySelectorAll(".ui-slider").forEach((el) => bindSlider(el, { value: Number(f.sfx?.value ?? save.settings.sfx) }));
    f.querySelectorAll(".ui-toggle").forEach((el) => {
      const name = el.querySelector("input")?.name;
      if (name && f[name]) bindToggle(el, { checked: !!f[name].checked });
    });
    f.querySelectorAll(".ui-dropdown").forEach((el) => {
      const name = el.querySelector("input")?.name;
      if (name && f[name]) bindDropdown(el, { value: f[name].value });
    });
  }
}

initUi();
