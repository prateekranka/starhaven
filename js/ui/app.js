import { loadSave, writeSave, showScreen, beep, haptic, native, audio } from "../boot.js";
import { sendPackChannel, sendPackReload } from "../bridge.js";
import { score } from "../audio/score.js";
import { detectDefaultQuality } from "../perf.js";
import { startBackgroundWarm, ensureMatchAssets, matchAssetsReady } from "../cache/assets.js";
import { parseSeed } from "../sim/seed.js";
import { populateMapSelect } from "../data/maps.js";
import { initKit, bindSlider, bindToggle, bindDropdown } from "./kit.js";
import { initTitleVista } from "./title-vista.js";
import { renderFactionPicks, renderLoreGrid } from "../data/civ-ui.js";
import { getCiv, DEFAULT_CIV_ID } from "../data/civ-schema.js";
import "../data/civs.js";

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
  mountCivScreens(save);
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
  })
    .then((id) => bindDropdown(document.getElementById("map-select"), { value: id || "bright-mesa" }))
    .catch((err) => {
      console.warn("map manifest load failed", err);
    });
  if (native) document.body.classList.add("native");
  initNativeHostSettings();
  watchCacheWarm();
  void mountBuildChip();
  void bootTitleScore();

  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    beep();
    haptic(8);
    if (action === "title") {
      loadGame().then(({ togglePause, stopMatch }) => {
        togglePause(false);
        stopMatch();
        document.getElementById("results-modal")?.classList.add("hidden");
        document.body.classList.remove("match-paused");
        showScreen("title");
        score.startTitle();
      });
    } else if (action === "skirmish") {
      mountCivScreens(save);
      showScreen("skirmish");
    } else if (action === "factions") {
      renderLoreGrid(document.getElementById("lore-grid"));
      showScreen("factions");
    } else if (action === "settings") showScreen("settings");
    else if (action === "tutorial") showScreen("tutorial");
    else if (action === "start-skirmish") {
      const faction = document.querySelector(".faction-pick.selected")?.dataset.faction || DEFAULT_CIV_ID;
      const difficulty = dropdownValue("diff-select") || "chieftain";
      const mapId = dropdownValue("map-select") || "bright-mesa";
      save.faction = faction;
      save.difficulty = difficulty;
      save.mapId = mapId;
      writeSave(save);
      playMatch({ playerFaction: faction, difficulty, mapId });
    } else if (action === "start-tutorial") {
      playMatch({ playerFaction: save.faction || DEFAULT_CIV_ID, tutorial: true, difficulty: "settler" });
    } else if (action === "pause-abandon-confirm") {
      loadGame().then(({ togglePause, stopMatch }) => {
        togglePause(false);
        stopMatch();
        showScreen("title");
      });
    } else if (action === "reload-pack") {
      sendPackReload();
    }
  });

  mountCivScreens(save);

  document.getElementById("settings-form").addEventListener("change", onSettingsChange);
  document.getElementById("pause-settings-form")?.addEventListener("change", onSettingsChange);
  document.getElementById("native-pack-channel")?.addEventListener("change", (e) => {
    const channel = e.target.value;
    localStorage.setItem("starhaven.packChannel", channel);
    sendPackChannel(channel);
  });

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

  for (const formId of ["settings-form", "pause-settings-form"]) {
    document.getElementById(formId)?.addEventListener("input", (e) => {
      if (e.target.name !== "music" && e.target.name !== "sfx") return;
      const s = loadSave();
      const f = e.target.form;
      s.settings.music = Number(f.music.value);
      s.settings.sfx = Number(f.sfx.value);
      writeSave(s);
      audio.applyVolumes();
      if (e.target.name === "music") score.refreshVolume();
    });
  }

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
      audio.applyVolumes();
      score.refreshVolume();
    },
  };

  const params = new URLSearchParams(location.search);
  initKitGallery();
  if (params.get("kit") === "1") showScreen("kit");
  if (params.get("play") === "1") {
    playMatch({
      playerFaction: params.get("faction") || save.faction || DEFAULT_CIV_ID,
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
  audio.applyVolumes();
  score.refreshVolume();
  loadGame().then(({ applyLiveSettings }) => applyLiveSettings?.(s.settings));
}

function initPauseSettings() {
  const panel = document.getElementById("pause-settings-form");
  if (!panel) return;
  panel.querySelectorAll(".ui-slider").forEach((el) => bindSlider(el));
  panel.querySelectorAll(".ui-toggle").forEach((el) => bindToggle(el));
  panel.querySelectorAll(".ui-dropdown").forEach((el) => bindDropdown(el));
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
  const showHud = new URLSearchParams(location.search).get("qa") === "1";
  startBackgroundWarm((done, total) => {
    if (!hud || !showHud) return;
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
    f.querySelectorAll(".ui-slider").forEach((el) => {
      const input = el.querySelector('input[type="range"]');
      bindSlider(el, { value: Number(input?.value ?? 0) });
    });
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

function initNativeHostSettings() {
  const section = document.getElementById("native-host-settings");
  if (!section) return;
  section.hidden = !native;
  const select = document.getElementById("native-pack-channel");
  if (!select) return;
  select.value = localStorage.getItem("starhaven.packChannel") || "development";
}

async function mountBuildChip() {
  const chip = document.getElementById("build-chip");
  const shaEl = document.getElementById("build-sha");
  if (!chip || !shaEl) return;
  let displaySha = "unknown";
  try {
    const res = await fetch("./build-info.json", { cache: "no-store" });
    if (res.ok) {
      const info = await res.json();
      if (info.displaySha) displaySha = info.displaySha;
    }
  } catch (err) {
    console.warn("build-info fetch failed", err);
  }
  shaEl.textContent = displaySha;
  chip.hidden = false;
}

async function bootTitleScore() {
  try {
    await startBackgroundWarm();
  } catch (err) {
    console.warn("title score preload", err);
    await audio.preload().catch(() => {});
  }
  if (document.getElementById("screen-title")?.classList.contains("active")) score.startTitle();
}

initUi();
