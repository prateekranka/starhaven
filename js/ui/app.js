import { loadSave, writeSave, todayStamp, showScreen, beep, haptic, native, postNative } from "../boot.js";
import { detectDefaultQuality } from "../perf.js";
import { startBackgroundWarm, ensureMatchAssets, matchAssetsReady } from "../cache/assets.js";

const DAILY = [
  { food: 50 },
  { crystal: 100 },
  { wood: 150 },
  { ore: 40 },
  { food: 80, wood: 80, crystal: 80, ore: 40 },
];

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
  paintDaily(save);
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
    } else if (action === "skirmish") showScreen("skirmish");
    else if (action === "factions") showScreen("factions");
    else if (action === "settings") showScreen("settings");
    else if (action === "tutorial") showScreen("tutorial");
    else if (action === "campaign") {
      playMatch({
        playerFaction: save.faction || "sunwoven",
        difficulty: "chieftain",
        campaign: true,
      });
    } else if (action === "start-skirmish") {
      const faction = document.querySelector(".faction-pick.selected")?.dataset.faction || "sunwoven";
      const difficulty = document.getElementById("diff-select").value;
      save.faction = faction;
      save.difficulty = difficulty;
      writeSave(save);
      playMatch({ playerFaction: faction, difficulty });
    } else if (action === "start-tutorial") {
      playMatch({ playerFaction: save.faction || "sunwoven", tutorial: true, difficulty: "settler" });
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

  document.getElementById("claim-btn").addEventListener("click", () => {
    const s = loadSave();
    const today = todayStamp();
    if (s.daily.lastClaim === today) return;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    s.daily.streak = s.daily.lastClaim === yesterday ? Math.min(5, s.daily.streak + 1) : 1;
    s.daily.lastClaim = today;
    const reward = DAILY[s.daily.streak - 1];
    s.crateBonus = { ...s.crateBonus, ...Object.fromEntries(Object.entries(reward).map(([k, v]) => [k, (s.crateBonus[k] || 0) + v])) };
    writeSave(s);
    paintDaily(s);
    beep(520, 0.12);
    postNative("claim", { streak: s.daily.streak, reward });
  });

  document.getElementById("settings-form").addEventListener("change", () => {
    const s = loadSave();
    const f = document.getElementById("settings-form");
    s.settings.music = Number(f.music.value);
    s.settings.sfx = Number(f.sfx.value);
    s.settings.quality = f.quality.value;
    s.settings.reduceMotion = f.reduceMotion.checked;
    s.settings.haptics = f.haptics.checked;
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
      playerFaction: params.get("faction") || save.faction || "sunwoven",
      difficulty: params.get("diff") || save.difficulty || "chieftain",
      tutorial: params.get("tutorial") === "1",
    });
  }
}

async function playMatch(opts) {
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
    await startMatch(opts);
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
}

function paintDaily(save) {
  const today = todayStamp();
  const claimed = save.daily.lastClaim === today;
  document.querySelectorAll(".track li").forEach((li) => {
    const day = Number(li.dataset.day);
    li.classList.toggle("claimed", day < save.daily.streak || (claimed && day === save.daily.streak));
    li.classList.toggle("today", day === Math.min(5, (save.daily.lastClaim === today ? save.daily.streak : save.daily.streak + 1) || 1));
  });
  const btn = document.getElementById("claim-btn");
  btn.disabled = claimed;
  btn.textContent = claimed ? "CLAIMED" : "CLAIM";
}

initUi();
