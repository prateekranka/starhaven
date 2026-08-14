import { loadSave, writeSave, showScreen, beep, haptic, native, postNative } from "../boot.js";
import { detectDefaultQuality } from "../perf.js";
import { startBackgroundWarm, ensureMatchAssets, matchAssetsReady } from "../cache/assets.js";
import { initKit, bindDropdown } from "./kit.js";

let gameMod = null;
let diffDropdown = null;
function loadGame() { if (!gameMod) gameMod = import("../game/main.js"); return gameMod; }
function dropdownValue(id) { const root = document.getElementById(id); return root?.querySelector('input[type="hidden"]')?.value || root?.dataset.value || ""; }

export function initUi() {
  const save = loadSave();
  if (!save.settings.quality || save.settings.quality === "medium") { save.settings.quality = detectDefaultQuality(); writeSave(save); }
  initKit();
  bindDropdown(document.getElementById("map-select"));
  diffDropdown = bindDropdown(document.getElementById("diff-select"), { value: save.difficulty || "chieftain" });
  applySettingsForm(save);
  if (native) document.body.classList.add("native");
  watchCacheWarm();

  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    beep(360, 0.05); haptic(8);
    const action = btn.dataset.action;
    if (action === "title") loadGame().then(({ togglePause, stopMatch }) => { togglePause(false); stopMatch(); showScreen("title"); });
    else if (action === "skirmish") showScreen("skirmish");
    else if (action === "factions") showScreen("factions");
    else if (action === "settings") showScreen("settings");
    else if (action === "tutorial") showScreen("tutorial");
    else if (action === "campaign") playMatch({ playerFaction: save.faction || "sunwoven", difficulty: "chieftain", campaign: true });
    else if (action === "start-skirmish") {
      const faction = document.querySelector(".faction-pick.selected")?.dataset.faction || "sunwoven";
      const difficulty = dropdownValue("diff-select");
      save.faction = faction; save.difficulty = difficulty; writeSave(save);
      playMatch({ playerFaction: faction, difficulty });
    } else if (action === "start-tutorial") playMatch({ playerFaction: save.faction || "sunwoven", tutorial: true, difficulty: "settler" });
  });

  document.querySelectorAll(".faction-pick").forEach((el) => {
    el.addEventListener("click", () => {
      document.querySelectorAll(".faction-pick").forEach((x) => x.classList.remove("selected"));
      el.classList.add("selected"); save.faction = el.dataset.faction; writeSave(save);
    });
  });

  document.getElementById("settings-form").addEventListener("change", () => {
    const s = loadSave(); const f = document.getElementById("settings-form");
    s.settings.music = Number(f.music.value); s.settings.sfx = Number(f.sfx.value); s.settings.quality = f.quality.value;
    s.settings.reduceMotion = f.reduceMotion.checked; s.settings.haptics = f.haptics.checked; s.settings.showDebug = f.showDebug.checked;
    writeSave(s); postNative("settings", s.settings);
  });
  document.getElementById("settings-form").addEventListener("input", (e) => { if (e.target.name === "sfx") document.getElementById("settings-form").dispatchEvent(new Event("change")); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") document.getElementById("btn-menu")?.click(); });
  window.StarhavenNative = {
    startSkirmish: (opts) => playMatch(opts || { playerFaction: loadSave().faction }),
    show: showScreen,
    applySettings: (settings) => { const s = loadSave(); s.settings = { ...s.settings, ...settings }; writeSave(s); applySettingsForm(s); },
  };
  const params = new URLSearchParams(location.search);
  if (params.get("play") === "1") playMatch({ playerFaction: params.get("faction") || save.faction || "sunwoven", difficulty: params.get("diff") || save.difficulty || "chieftain", tutorial: params.get("tutorial") === "1" });
}

async function playMatch(opts) {
  const veil = document.getElementById("boot-veil"); const bar = document.getElementById("boot-veil-bar"); const copy = document.getElementById("boot-veil-copy");
  if (!matchAssetsReady()) { veil?.classList.remove("hidden"); if (copy) copy.textContent = "Loading Bright Mesa"; if (bar) bar.style.width = "8%"; }
  try {
    await ensureMatchAssets((done, total) => { const pct = total ? Math.max(8, Math.round((done / total) * 100)) : 8; if (bar) bar.style.width = `${pct}%`; if (copy) copy.textContent = `Caching sprites ${done}/${total}`; });
    if (copy) copy.textContent = "Starting match"; const { startMatch } = await loadGame(); await startMatch(opts);
  } catch (err) { console.error(err); if (copy) copy.textContent = "Could not load match assets."; return; }
  veil?.classList.add("hidden");
}

function watchCacheWarm() {
  const hud = document.getElementById("cache-hud"); const label = document.getElementById("cache-hud-label"); const bar = document.getElementById("cache-hud-bar");
  startBackgroundWarm((done, total) => {
    if (!hud) return; hud.hidden = false; const pct = total ? Math.round((done / total) * 100) : 0;
    if (bar) bar.style.width = `${pct}%`; if (label) label.textContent = pct >= 100 ? "Mesa cached" : `Caching mesa ${done}/${total}`;
    if (pct >= 100) setTimeout(() => { hud.hidden = true; }, 1600);
  }).catch((err) => { console.warn("asset warm failed", err); if (hud) hud.hidden = true; });
}

function syncToggle(form, name, on) {
  const input = form[name]; input.checked = on; const root = input.closest(".ui-toggle");
  root?.classList.toggle("on", on); root?.querySelector(".ui-toggle-btn")?.setAttribute("aria-checked", on ? "true" : "false");
}

function applySettingsForm(save) {
  const f = document.getElementById("settings-form");
  f.music.value = save.settings.music;
  const sfxInput = f.querySelector('[name="sfx"]'); if (sfxInput) { sfxInput.value = save.settings.sfx; sfxInput.dispatchEvent(new Event("input", { bubbles: true })); }
  const qualityRoot = f.querySelector('.ui-dropdown input[name="quality"]')?.closest(".ui-dropdown");
  if (qualityRoot) bindDropdown(qualityRoot, { value: save.settings.quality });
  syncToggle(f, "reduceMotion", save.settings.reduceMotion); syncToggle(f, "haptics", save.settings.haptics); syncToggle(f, "showDebug", !!save.settings.showDebug);
  if (diffDropdown) diffDropdown.value = save.difficulty || "chieftain";
}

initUi();
