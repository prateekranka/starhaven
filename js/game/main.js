import { createMatch, updateWorld, commandGround, tryPlace, queueUnit, tryAgeUp, idleVillager, selectedEntities, villagerBuildOptions, matchStats, formatDuration, BUILDINGS, UNITS, worldFromQ10, q10FromWorld, isBuilt } from "../sim/engine.js";
import { canPackBuilding, isStormveilFaction, tryPackBuilding, trySummonDarkness } from "../sim/civs/stormveil.js";
import { distanceSquaredQ10, q10RangeSq, ticksToSec } from "../sim/fixed.js";
import { civDisplayName, civSelectionPortrait, civBuildThumb, civUsesFood } from "../data/civ-schema.js";
import { civMechanics } from "../sim/civs/index.js";
import "../data/civs.js";
import { createRenderer } from "./render.js";
import { audio, haptic, loadSave, showScreen, beep } from "../boot.js";
import { bridgeSend, setBridgeMatchId } from "../bridge.js";
import { createMatchAudio } from "../audio/match-audio.js";
import { score } from "../audio/score.js";
import { createFramePacer, isQaMode, setText, resolveQuality } from "../perf.js";
import { ensureMatchAssets } from "../cache/assets.js";
import { loadMap } from "../data/maps.js";
import { biomeRgb } from "../data/map-biomes.js";
import { minimapCellColor } from "../sim/civs/ashvein.js";
import { checksumWorld, mapLayoutFingerprint } from "../sim/checksum.js";
import {
  beginMatchSnapshot,
  buildBridgeSnapshot,
  clearMatchSnapshot,
  recordMatchCommand,
  restoreFromSnapshotRequest,
  resumeMatchSnapshot,
  loadPersistedMatchSnapshot,
} from "../sim/match-snapshot.js";

const wx = (e) => worldFromQ10(e.xQ10);
const wz = (e) => worldFromQ10(e.zQ10);

let world = null;
let view = null;
let raf = 0;
let last = 0;
let paused = false;
let pointers = new Map();
let boxEl = null;
let inputAbort = null;
let pinch0 = 0;
let attackMove = false;
let lastSelKey = "";
let simAcc = 0;
let hudAcc = 0;
let mapAcc = 0;
let lastSimMs = 0;
let lastDrawMs = 0;
let cursorX = -1;
let cursorY = -1;
const heldKeys = new Set();
let pacer = null;
let qualityName = "ultra";
let matchAudio = null;
const SIM_DT = 1 / 60;
const ZOOM_STEP = 4;
const DBL_MS = 400;
const DBL_PX = 36;
let emptyTap = null;
let emptyTapTimer = 0;
let lastMatchOpts = null;
let resultsShown = false;
let combatHapticAt = 0;
const hpWatch = new Map();

export async function startMatch(opts = {}) {
  await ensureMatchAssets(undefined, {
    playerFaction: opts.playerFaction,
    enemyFaction: opts.enemyFaction,
    mapId: opts.mapId,
  });
  stopMatch();
  const save = loadSave();
  lastMatchOpts = { ...opts };
  resultsShown = false;
  combatHapticAt = 0;
  hpWatch.clear();
  const mapId = opts.mapId || save.mapId || "bright-mesa";
  beginMatchSnapshot({ ...opts, mapId });
  const map = await loadMap(mapId, opts.seed ?? save.seed);
  world = createMatch({ ...opts, map, mapId });
  setBridgeMatchId(String(world.seed >>> 0));
  bridgeSend("match.started", { route: "pixel-mesa", faction: opts.playerFaction || "sunwoven" });
  matchAudio = createMatchAudio();
  matchAudio.reset(world);

  showScreen("game");
  document.getElementById("results-modal")?.classList.add("hidden");
  document.getElementById("pause-modal")?.classList.add("hidden");
  paused = false;
  lastSelKey = "";
  attackMove = false;
  simAcc = 0;
  hudAcc = 0;
  mapAcc = 0;
  pacer = createFramePacer();
  document.getElementById("perf-chip")?.classList.toggle("hidden", !perfChipEnabled());

  const viewport = document.getElementById("viewport");
  viewport.innerHTML = "";
  void viewport.offsetHeight;
  const quality = save.settings.quality || "ultra";
  qualityName = quality;
  view = createRenderer(viewport, quality, { reduceMotion: !!save.settings.reduceMotion, map: world.map });
  bindInput(viewport);
  last = performance.now();
  raf = requestAnimationFrame(loop);
  const tc = world.buildings.find((b) => b.owner === "player" && b.type === "towncenter");
  if (tc) view.lookAt(wx(tc), wz(tc), true);
  world.selection = [];
  renderSelection();
  drawHud(world, true);
  drawMinimap(world, view);
  paintDebugState();
  score.startMatch();
}

export function stopMatch() {
  cancelAnimationFrame(raf);
  score.stop();
  matchAudio = null;
  inputAbort?.abort();
  inputAbort = null;
  view?.dispose?.();
  world = null;
  pacer = null;
  heldKeys.clear();
  cursorX = -1;
  cursorY = -1;
  const viewport = document.getElementById("viewport");
  if (viewport) viewport.innerHTML = "";
  view = null;
  pointers.clear();
  hideBox();
  clearEmptyTap(false);
  setBridgeMatchId(null);
  hpWatch.clear();
  clearMatchSnapshot();
}

export function togglePause(on) {
  paused = on ?? !paused;
  document.getElementById("pause-modal")?.classList.toggle("hidden", !paused);
  document.body.classList.toggle("match-paused", paused);
  if (!paused) resetPausePanels();
}
function resetPausePanels() {
  document.getElementById("pause-menu")?.classList.remove("hidden");
  document.getElementById("pause-settings-panel")?.classList.add("hidden");
  document.getElementById("pause-abandon-panel")?.classList.add("hidden");
}
export function applyLiveSettings(settings) {
  if (!view) return;
  qualityName = settings.quality || qualityName;
  view.setQuality?.(settings.quality);
  view.setReduceMotion?.(!!settings.reduceMotion);
  document.getElementById("perf-chip")?.classList.toggle("hidden", !perfChipEnabled());
}
export async function restartMatch() {
  if (!lastMatchOpts) return;
  await startMatch(lastMatchOpts);
}

export function sendMatchSnapshot(pausedFlag = false) {
  if (!world) return null;
  const payload = buildBridgeSnapshot(world, pausedFlag);
  if (payload) bridgeSend("match.snapshot", payload);
  return payload;
}

/** @param {{ tick?: number, checksum?: string, seed?: number, paused?: boolean }} request */
export async function restoreMatch(request = {}) {
  try {
    const persisted = loadPersistedMatchSnapshot();
    if (!persisted) throw new Error("No persisted match snapshot");
    const mapId = persisted.matchOpts?.mapId || request.mapId || "bright-mesa";
    const map = await loadMap(mapId, request.seed ?? persisted.seed);
    const restored = restoreFromSnapshotRequest(request, { map, mapId });
    if (!restored) return;
    await resumeWorld(restored.world, restored.matchOpts, restored.paused, persisted?.commands || []);
    bridgeSend("restore.completed", {
      restored: true,
      tick: restored.tick,
      checksum: restored.checksum,
    });
  } catch (err) {
    console.error("[match-restore]", err);
    bridgeSend("restore.completed", { restored: false, reason: String(err?.message || err) });
  }
}

async function resumeWorld(restoredWorld, opts, shouldPause, commands = []) {
  cancelAnimationFrame(raf);
  inputAbort?.abort();
  inputAbort = null;
  view?.dispose?.();
  const save = loadSave();
  lastMatchOpts = { ...opts };
  resultsShown = false;
  combatHapticAt = 0;
  hpWatch.clear();
  resumeMatchSnapshot(opts, commands);
  world = restoredWorld;
  setBridgeMatchId(String(world.seed >>> 0));
  showScreen("game");
  document.getElementById("end-banner")?.classList.add("hidden");
  document.getElementById("results-modal")?.classList.add("hidden");
  document.getElementById("pause-modal")?.classList.add("hidden");
  paused = false;
  lastSelKey = "";
  attackMove = false;
  simAcc = 0;
  hudAcc = 0;
  mapAcc = 0;
  pacer = createFramePacer();
  document.getElementById("perf-chip")?.classList.toggle("hidden", !perfChipEnabled());
  const viewport = document.getElementById("viewport");
  viewport.innerHTML = "";
  void viewport.offsetHeight;
  const quality = save.settings.quality || "ultra";
  qualityName = quality;
  view = createRenderer(viewport, quality, { reduceMotion: !!save.settings.reduceMotion, map: world.map });
  bindInput(viewport);
  last = performance.now();
  raf = requestAnimationFrame(loop);
  const tc = world.buildings.find((b) => b.owner === "player" && b.type === "towncenter");
  if (tc) view.lookAt(wx(tc), wz(tc), true);
  world.selection = [];
  renderSelection();
  drawHud(world, true);
  drawMinimap(world, view);
  paintDebugState();
  matchAudio = createMatchAudio();
  matchAudio.reset(world);
  score.startMatch();
  if (shouldPause) togglePause(true);
}

function recordCommand(command) {
  if (!world) return;
  recordMatchCommand({ ...command, tick: world.t | 0 });
}

function issueRecordedMove(x, z, attackMoveFlag = false) {
  recordCommand({ type: "move", unitIds: world.selection.slice(), x, z, attackMove: !!attackMoveFlag });
  commandGround(world, x, z, attackMoveFlag);
}

function perfChipEnabled() {
  return isQaMode() || !!loadSave().settings.showDebug;
}

/* Command hooks for the QA harness. Only installed with ?qa=1 so playtest builds stay untouched. */
if (isQaMode()) {
  window.__starhavenMove = function (unitIds, x, z, attackMove) {
    if (!world) return { ok: false, why: "no-match-in-progress" };
    const ids = Array.isArray(unitIds) ? unitIds : unitIds == null ? null : [unitIds];
    let sel;
    if (ids && ids.length) {
      const set = new Set(ids);
      sel = world.units.filter((u) => u.owner === "player" && u.kind === "unit" && set.has(u.id));
    } else {
      sel = selectedEntities(world).filter((e) => e.kind === "unit" && e.owner === "player");
    }
    if (!sel.length) return { ok: false, why: "no-player-units", selection: world.selection.slice() };
    world.selection = sel.map((u) => u.id);
    const round = (n) => Math.round(n * 100) / 100;
    const before = sel.map((u) => ({ id: u.id, state: u.state, x: round(wx(u)), z: round(wz(u)) }));
    commandGround(world, x, z, !!attackMove);
    recordCommand({ type: "move", unitIds: world.selection.slice(), x, z, attackMove: !!attackMove });
    return {
      ok: true,
      issuedAt: Date.now(),
      worldTick: world.t,
      command: { x, z, attackMove: !!attackMove },
      moved: sel.map((u) => u.id),
      before,
      after: sel.map((u) => ({ id: u.id, state: u.state, x: round(wx(u)), z: round(wz(u)) })),
    };
  };

  window.__starhavenTrain = function (buildingId, type) {
    if (!world) return { ok: false, why: "no-match-in-progress" };
    const b = world.buildings.find((x) => x.id === buildingId);
    if (!b) return { ok: false, why: "no-building", buildingId };
    const res = queueUnit(world, b, type);
    if (res?.ok) recordCommand({ type: "train", buildingId, unitType: type });
    return { ok: !!res?.ok, why: res?.why, buildingId, type };
  };
}

function trackCombatHaptics() {
  if (!world) return;
  for (const e of [...world.units, ...world.buildings]) {
    const prev = hpWatch.get(e.id);
    hpWatch.set(e.id, e.hp);
    if (prev == null || e.hp >= prev) continue;
    if (e.owner !== "player" && e.owner !== "enemy") continue;
    const now = performance.now();
    if (now - combatHapticAt < 120) continue;
    combatHapticAt = now;
    haptic(8, "combatHit");
    break;
  }
}

function loop(now) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!world || !view) return;

  const scale = pacer.sample(dt * 1000, lastSimMs + lastDrawMs);
  if (pacer.shouldApply(now) && view.setAdaptiveScale) view.setAdaptiveScale(scale);

  if (!paused) {
    simAcc += dt;
    let steps = 0;
    const simT0 = performance.now();
    while (simAcc >= SIM_DT && steps < 4) {
      updateWorld(world, SIM_DT);
      simAcc -= SIM_DT;
      steps++;
    }
    lastSimMs = performance.now() - simT0;
    trackCombatHaptics();
  }

  const drawT0 = performance.now();
  view.sync(world, dt);
  lastDrawMs = performance.now() - drawT0;
  if (!paused) applyCameraRig(dt);

  hudAcc += dt;
  if (hudAcc >= 0.05) {
    hudAcc = 0;
    drawHud(world, false);
    paintPerf();
    paintQaChip(world);
    paintDebugState();
  }
  const selKey = world.selection.join(",");
  if (selKey !== lastSelKey) {
    lastSelKey = selKey;
    renderSelection();
  } else if (selKey) {
    const e = selectedEntities(world)[0];
    if (e) {
      document.getElementById("sel-hp-bar").style.width = `${Math.max(0, e.hp / e.maxHp) * 100}%`;
      setText("sel-hp-text", `${e.hp | 0}/${e.maxHp | 0}`);
    } else renderSelection();
  }

  const q = resolveQuality(qualityName);
  mapAcc += dt;
  if (mapAcc >= 1 / Math.max(4, q.minimapHz)) {
    mapAcc = 0;
    drawMinimap(world, view);
  }

  if (world.winner && !resultsShown) {
    resultsShown = true;
    showResults(world);
  }

  matchAudio?.tick(world, view);
}
function showResults(world) {
  const modal = document.getElementById("results-modal");
  if (!modal) return;
  const won = world.winner === "player";
  const stats = matchStats(world, "player");
  setText("results-title", won ? "VICTORY" : "DEFEAT");
  setText("results-sub", won ? "The mesa is yours. The Bright Line keeps moving." : "Your Town Center is ash.");
  setText("stat-duration", formatDuration(stats.duration));
  setText("stat-gathered", String(stats.totalGathered));
  setText("stat-trained", String(stats.unitsTrained));
  setText("stat-lost", String(stats.unitsLost));
  setText("stat-razed", String(stats.buildingsRazed));
  setText("stat-score", String(stats.score));
  haptic(20, "matchEnded");
  bridgeSend("match.ended", {
    faction: world.players.player.faction,
    outcome: won ? "Victory" : "Defeat",
    duration: formatDuration(stats.duration),
    seed: String(world.seed >>> 0),
    checksum: checksumWorld(world),
  });
  modal.classList.remove("hidden");
  document.body.classList.add("match-paused");
}

function paintPerf() {
  const el = document.getElementById("perf-chip");
  if (!el || !pacer || !view?.stats) return;
  if (!perfChipEnabled()) {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  const s = view.stats();
  const fps = Math.round(pacer.fps);
  const tag = s.software ? "CPU GL" : s.fourK ? "4K" : s.w >= 2500 ? "QHD+" : s.w >= 1800 ? "FHD" : "HD";
  el.textContent = `${fps} FPS · ${s.text} · ${tag}`;
  el.dataset.ok = fps >= 58 ? "1" : "0";
  window.__starhavenPerf = {
    fps,
    ema: pacer.ema,
    scale: pacer.scale,
    width: s.w,
    height: s.h,
    fourK: s.fourK,
    quality: s.quality,
    software: !!s.software,
    gpu: s.gpu || "",
    calls: s.calls,
    simMs: lastSimMs,
    drawMs: lastDrawMs,
  };
}

function paintQaChip(world) {
  const el = document.getElementById("qa-chip");
  if (!el) return;
  if (!isQaMode() || !world) {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  setText(
    el,
    `tick ${world.t} · chk ${checksumWorld(world)} · seed 0x${(world.seed >>> 0).toString(16)}`
  );
}

function paintDebugState() {
  if (!world || !view) return;
  const cam = view.cameraInfo();
  const units = [];
  for (const u of world.units) {
    if (u.owner !== "player") continue;
    const p = view.project(wx(u), wz(u));
    units.push({ id: u.id, type: u.type, x: wx(u), z: wz(u), state: u.state, sx: p.x, sy: p.y });
  }
  const buildings = [];
  for (const b of world.buildings) {
    if (b.owner !== "player") continue;
    const p = view.project(wx(b), wz(b));
    buildings.push({ id: b.id, type: b.type, x: wx(b), z: wz(b), sx: p.x, sy: p.y });
  }
  window.__starhavenState = {
    sel: world.selection.slice(),
    tick: world.t,
    seed: world.seed,
    seedHex: `0x${(world.seed >>> 0).toString(16)}`,
    mapFingerprint: mapLayoutFingerprint(world),
    checksum: checksumWorld(world),
    frustum: cam.frustumDesired ?? cam.frustum,
    frustumLive: cam.frustum,
    zoomMin: cam.min,
    zoomMax: cam.max,
    units,
    buildings,
    placing: world.placing,
  };
  syncZoomButtons(cam);
}

function syncZoomButtons(cam) {
  const info = cam || view?.cameraInfo?.();
  if (!info) return;
  const inn = document.getElementById("btn-zoom-in");
  const out = document.getElementById("btn-zoom-out");
  const f = info.frustumDesired ?? info.frustum;
  if (inn) inn.disabled = f <= (info.min ?? 14) + 0.05;
  if (out) out.disabled = f >= (info.max ?? 48) - 0.05;
}

function nudgeZoom(dir) {
  if (!view) return;
  view.zoom(dir * ZOOM_STEP);
  paintDebugState();
}

function clearEmptyTap(deselect) {
  if (emptyTapTimer) {
    clearTimeout(emptyTapTimer);
    emptyTapTimer = 0;
  }
  const snap = emptyTap;
  emptyTap = null;
  if (deselect && world && snap?.selection?.length) {
    world.selection = [];
    renderSelection();
  }
}

function applyCameraRig(dt) {
  if (!view) return;
  let dx = 0;
  let dz = 0;
  if (heldKeys.has("w") || heldKeys.has("arrowup")) dz -= 1;
  if (heldKeys.has("s") || heldKeys.has("arrowdown")) dz += 1;
  if (heldKeys.has("a") || heldKeys.has("arrowleft")) dx -= 1;
  if (heldKeys.has("d") || heldKeys.has("arrowright")) dx += 1;
  const margin = 28;
  if (cursorX >= 0 && cursorY >= 0) {
    if (cursorX < margin) dx -= 1;
    if (cursorX > innerWidth - margin) dx += 1;
    if (cursorY < margin) dz -= 1;
    if (cursorY > innerHeight - margin) dz += 1;
  }
  if (!dx && !dz) return;
  const boost = heldKeys.has("shift") ? 2.1 : 1;
  const sp = 26 * dt * boost;
  view.pan(dx * sp, dz * sp);
}

function bindInput(viewport) {
  const el = viewport;
  inputAbort = new AbortController();
  const sig = { signal: inputAbort.signal };
  el.addEventListener("pointerdown", onDown, sig);
  el.addEventListener("pointermove", onMove, sig);
  el.addEventListener("pointerup", onUp, sig);
  el.addEventListener("pointercancel", onUp, sig);
  el.addEventListener(
    "contextmenu",
    (e) => {
      e.preventDefault();
      const g = view.groundPick(e.clientX, e.clientY);
      if (g) {
        issueRecordedMove(g.x, g.z, true);
        audio.play("attack");
        clearEmptyTap(false);
      }
    },
    sig
  );
  el.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      view.zoom(e.deltaY * 0.02);
    },
    { passive: false, signal: inputAbort.signal }
  );

  document.getElementById("btn-idle").onclick = () => {
    clearEmptyTap(false);
    const u = idleVillager(world);
    if (u) {
      view.lookAt(wx(u), wz(u));
      audio.play("select");
      renderSelection();
    }
  };
  const atkBtn = document.getElementById("btn-atk");
  if (atkBtn) {
    atkBtn.onclick = () => {
      attackMove = !attackMove;
      atkBtn.classList.toggle("active", attackMove);
      world.tip = attackMove ? "Attack-move: double-tap the ground." : "Move: double-tap the ground.";
    };
  }
  document.getElementById("btn-speed").onclick = (e) => {
    world.speed = world.speed === 1 ? 2 : 1;
    e.currentTarget.textContent = world.speed + "x";
  };
  document.getElementById("btn-menu").onclick = () => togglePause(true);
  document.getElementById("resume-btn").onclick = () => togglePause(false);
  document.getElementById("pause-restart-btn")?.addEventListener("click", () => { togglePause(false); restartMatch(); });
  document.getElementById("results-rematch")?.addEventListener("click", () => {
    document.getElementById("results-modal")?.classList.add("hidden");
    document.body.classList.remove("match-paused");
    restartMatch();
  });
  const zoomIn = document.getElementById("btn-zoom-in");
  const zoomOut = document.getElementById("btn-zoom-out");
  if (zoomIn) zoomIn.onclick = () => nudgeZoom(-1);
  if (zoomOut) zoomOut.onclick = () => nudgeZoom(1);
  syncZoomButtons();

  window.addEventListener(
    "keydown",
    (e) => {
      if (!view || !world) return;
      heldKeys.add(e.key.toLowerCase());
      if (e.key === ".") document.getElementById("btn-idle")?.click();
      if (e.key === "a" && e.ctrlKey) {
        e.preventDefault();
        attackMove = !attackMove;
      }
    },
    { signal: inputAbort.signal }
  );
  window.addEventListener(
    "keyup",
    (e) => {
      heldKeys.delete(e.key.toLowerCase());
    },
    { signal: inputAbort.signal }
  );
  window.addEventListener(
    "pointermove",
    (e) => {
      cursorX = e.clientX;
      cursorY = e.clientY;
    },
    { signal: inputAbort.signal }
  );
  window.addEventListener(
    "blur",
    () => heldKeys.clear(),
    { signal: inputAbort.signal }
  );

  const mm = document.getElementById("minimap");
  const jump = (ev) => {
    const r = mm.getBoundingClientRect();
    const u = (ev.clientX - r.left) / r.width;
    const v = (ev.clientY - r.top) / r.height;
    view.lookAt(u * 96, v * 96);
  };
  mm.onpointerdown = (ev) => {
    mm.setPointerCapture(ev.pointerId);
    jump(ev);
  };
  mm.onpointermove = (ev) => {
    if (ev.buttons) jump(ev);
  };
}

function onDown(e) {
  if (paused) return;
  if (e.button === 2) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
  e.target.setPointerCapture?.(e.pointerId);
  if (pointers.size === 1 && !world.placing) {
    ensureBox(e.clientX, e.clientY);
  }
}

function onMove(e) {
  if (paused) return;
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  if (pointers.size >= 2) {
    hideBox();
    const pts = [...pointers.values()];
    const distNow = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (!pinch0) pinch0 = distNow;
    else view.zoom((pinch0 - distNow) * 0.05);
    pinch0 = distNow;
    const cx = (pts[0].x + pts[1].x) / 2;
    const cy = (pts[0].y + pts[1].y) / 2;
    view.pan(dx * -0.03, dy * -0.03);
    void cx;
    void cy;
    return;
  }
  if (world.placing) {
    const g = view.groundPick(e.clientX, e.clientY);
    if (g) {
      world.placeX = g.x;
      world.placeZ = g.z;
      view.setGhost(g.x, g.z, true);
    }
    return;
  }
  if (boxEl && pointers.size === 1) {
    const x = Math.min(p.sx, e.clientX);
    const y = Math.min(p.sy, e.clientY);
    boxEl.style.left = x + "px";
    boxEl.style.top = y + "px";
    boxEl.style.width = Math.abs(e.clientX - p.sx) + "px";
    boxEl.style.height = Math.abs(e.clientY - p.sy) + "px";
  }
}

function onUp(e) {
  if (paused) return;
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch0 = 0;
  if (!p || !world) {
    hideBox();
    return;
  }
  const dist = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
  const g = view.groundPick(e.clientX, e.clientY);
  if (world.placing && g && dist < 12) {
    const placingType = world.placing;
    const res = tryPlace(world, "player", placingType, g.x, g.z);
    world.tip = res.ok ? "Builders inbound." : res.why;
    if (res.ok) {
      audio.play("build", { x: g.x, z: g.z });
      haptic();
      world.placing = null;
      recordCommand({ type: "place", buildingType: placingType, x: g.x, z: g.z, owner: "player" });
    } else audio.play("build_fail");
    hideBox();
    renderSelection();
    return;
  }
  if (world.placingDarkness && g && dist < 12) {
    const res = trySummonDarkness(world, "player", g.x, g.z);
    world.tip = res.ok ? "Dark veil summoned." : res.why;
    beep(res.ok ? 220 : 140, res.ok ? 0.12 : 0.06);
    world.placingDarkness = false;
    hideBox();
    renderSelection();
    return;
  }
  if (dist < 14 && g) {
    const hit = pickEntity(world, g.x, g.z);
    if (hit && hit.owner === "player") {
      clearEmptyTap(false);
      world.selection = e.shiftKey ? [...new Set([...world.selection, hit.id])] : [hit.id];
      audio.play("select", { x: wx(hit), z: wz(hit) });
      haptic(8, "select");
    } else if (hit && hit.owner !== "player") {
      clearEmptyTap(false);
      if (world.selection.length) {
        issueRecordedMove(g.x, g.z);
        audio.play("attack", { x: g.x, z: g.z });
      }
    } else {
      onEmptyGround(e, g);
    }
  } else if (boxEl && dist >= 14) {
    clearEmptyTap(false);
    boxSelect(p.sx, p.sy, e.clientX, e.clientY);
  }
  hideBox();
  renderSelection();
  paintDebugState();
}

function onEmptyGround(e, g) {
  const now = performance.now();
  const prior = emptyTap;
  const pair =
    prior &&
    prior.selection.length &&
    now - prior.t <= DBL_MS &&
    Math.hypot(e.clientX - prior.cx, e.clientY - prior.cy) <= DBL_PX;
  if (pair) {
    const ids = prior.selection;
    clearEmptyTap(false);
    world.selection = ids;
    issueRecordedMove(g.x, g.z, attackMove || e.shiftKey);
    audio.play(attackMove || e.shiftKey ? "attack" : "move", { x: g.x, z: g.z });
    haptic(8, "orderAccepted");
    return;
  }
  const snap = world.selection.slice();
  clearEmptyTap(false);
  emptyTap = { t: now, cx: e.clientX, cy: e.clientY, selection: snap };
  if (!snap.length) return;
  /* Optimistic deselect: hide selection immediately; restore if a second tap arrives within DBL_MS. */
  world.selection = [];
  emptyTapTimer = setTimeout(() => {
    emptyTapTimer = 0;
    emptyTap = null;
  }, DBL_MS);
}

function ensureBox(x, y) {
  hideBox();
  boxEl = document.createElement("div");
  boxEl.className = "box-select";
  boxEl.style.left = x + "px";
  boxEl.style.top = y + "px";
  document.body.appendChild(boxEl);
}

function hideBox() {
  boxEl?.remove();
  boxEl = null;
}

function boxSelect(x0, y0, x1, y1) {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  const ids = [];
  for (const u of world.units) {
    if (u.owner !== "player") continue;
    const g = projectApprox(wx(u), wz(u));
    if (g.x >= x && g.x <= x + w && g.y >= y && g.y <= y + h) ids.push(u.id);
  }
  if (ids.length) world.selection = ids;
}

function projectApprox(wx, wz) {
  if (view.project) return view.project(wx, wz);
  const el = view.renderer.domElement.getBoundingClientRect();
  return { x: el.left + el.width / 2, y: el.top + el.height / 2 };
}

function pickEntity(world, x, z) {
  let best = null;
  let bdSq = q10RangeSq(1.8);
  const click = { xQ10: q10FromWorld(x), zQ10: q10FromWorld(z) };
  for (const e of [...world.units, ...world.buildings]) {
    const rad = e.kind === "building" ? (e.size || 2) * 1.15 : 1.15;
    const dSq = distanceSquaredQ10(click, e);
    if (dSq < q10RangeSq(rad) && dSq < bdSq) {
      bdSq = dSq;
      best = e;
    }
  }
  return best;
}

function drawHud(world) {
  const p = world.players.player;
  const showFood = civUsesFood(p.faction);
  const foodRow = document.querySelector('.resources li[title="Lumenfruit"]');
  if (foodRow) foodRow.hidden = !showFood;
  if (showFood) setText("res-food", p.stock.food | 0);
  setText("res-wood", p.stock.wood | 0);
  setText("res-crystal", p.stock.crystal | 0);
  setText("res-ore", p.stock.ore | 0);
  setText("res-pop", `${p.pop}/${p.popCap}`);
  if (showFood) setText("rate-food", p.rates.food ? `+${p.rates.food.toFixed(1)}/s` : "");
  setText("rate-wood", p.rates.wood ? `+${p.rates.wood.toFixed(1)}/s` : "");
  setText("rate-crystal", p.rates.crystal ? `+${p.rates.crystal.toFixed(1)}/s` : "");
  setText("rate-ore", p.rates.ore ? `+${p.rates.ore.toFixed(1)}/s` : "");
  setText("age-label", p.agingTicks > 0 ? `AGING ${Math.ceil(ticksToSec(p.agingTicks))}s` : ["AGE I · FOUNDATION", "AGE II · RADIANT EXPANSE", "AGE III · ASCENSION"][p.age - 1]);
  setText("objective-text", world.objective);
  setText("tip", world.tip ? `TIP: ${world.tip}` : "");
}

function renderSelection() {
  const box = document.getElementById("selection");
  const cmds = document.getElementById("commands");
  const queue = document.getElementById("queue");
  const sel = selectedEntities(world);
  if (!sel.length) {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  const e = sel[0];
  const faction = e.faction || world.players.player.faction;
  const name = e.kind === "unit" ? civDisplayName(faction, e.type, "unit") : civDisplayName(faction, e.type, "building");
  document.getElementById("sel-name").textContent = sel.length > 1 ? `${sel.length} SELECTED` : name;
  document.getElementById("sel-meta").textContent = e.kind === "unit" ? UNITS[e.type].role : BUILDINGS[e.type].name;
  const hp = e.hp / e.maxHp;
  document.getElementById("sel-hp-bar").style.width = `${Math.max(0, hp) * 100}%`;
  document.getElementById("sel-hp-text").textContent = `${e.hp | 0}/${e.maxHp | 0}`;
  const portrait = document.getElementById("sel-portrait");
  if (portrait) {
    const src = civSelectionPortrait(faction, e) || selectionPortrait(e, faction);
    if (src) portrait.src = src;
  }
  cmds.innerHTML = "";
  queue.innerHTML = "";

  if (e.kind === "unit" && e.owner === "player") {
    cmds.appendChild(iconBtn("MOVE", "media/sprites/icon-move.png", () => {
      world.tip = "Move: double-tap the ground.";
    }));
    cmds.appendChild(iconBtn("STOP", "media/sprites/icon-hold.png", () => {
      for (const u of sel) {
        if (u.kind === "unit") {
          u.state = "idle";
          u.path = [];
        }
      }
    }));
  }

  if (e.kind === "unit" && e.type === "villager" && e.owner === "player") {
    for (const t of villagerBuildOptions(world)) {
      cmds.appendChild(
        iconBtn(BUILDINGS[t].name, buildIcon(t, faction), () => {
          world.placing = t;
          world.tip = `Place ${BUILDINGS[t].name}. Tap the mesa.`;
          audio.play("build");
        })
      );
    }
  }
  if (e.kind === "unit" && e.type === "wagon" && e.owner === "player") {
    cmds.appendChild(btn("Deploy", () => { world.tip = "Tap ground to deploy packed structure (20 wood)."; }));
  }
  if (isStormveilFaction(world.players.player.faction) && e.owner === "player") {
    cmds.appendChild(btn("Dark Veil", () => { world.placingDarkness = true; world.placing = null; world.tip = "Tap ground to summon darkness (60 crystal)."; beep(220, 0.08); }));
  }
  if (e.kind === "building" && e.owner === "player" && isBuilt(e) && isStormveilFaction(faction) && canPackBuilding(world, "player", e).ok) {
    cmds.appendChild(btn("Pack", () => { const r = tryPackBuilding(world, "player", e.id); world.tip = r.ok ? `Packing ${BUILDINGS[e.type].name}… (4s, 30 wood).` : r.why; beep(r.ok ? 360 : 140); renderSelection(); }));
  }
  if (e.kind === "building" && e.owner === "player" && isBuilt(e)) {
    const mech = civMechanics(faction);
    if (e.powered === false) cmds.appendChild(btn("UNPOWERED", () => { world.tip = "Relay this structure to your Foundry Core grid."; }));
    const produces = BUILDINGS[e.type].produces || [];
    const verb = mech.usesTrainingQueue ? "Training" : "Assembling";
    for (const t of produces) {
      const label = civDisplayName(faction, t, "unit");
      cmds.appendChild(
        iconBtn(label, trainIcon(t, faction), () => {
          const r = queueUnit(world, e, t);
          if (r.ok) recordCommand({ type: "train", buildingId: e.id, unitType: t });
          world.tip = r.ok ? `${verb} ${label}` : r.why;
          audio.play(r.ok ? "train" : "train_fail");
          renderSelection();
        })
      );
    }
    if (e.type === "towncenter") {
      cmds.appendChild(
        iconBtn("Age Up", ageIcon(faction), () => {
          const r = tryAgeUp(world, "player");
          if (r.ok) recordCommand({ type: "ageUp", owner: "player" });
          world.tip = r.ok ? "The Town Center chants. Age up begun." : r.why;
          if (r.ok) audio.play("age_up");
          else audio.play("train_fail");
        })
      );
    }
    for (const q of e.queue) {
      const chip = document.createElement("span");
      chip.textContent = `${UNITS[q.type].name} ${Math.ceil(ticksToSec(q.leftTicks))}s`;
      chip.style.cssText = "border:1px solid #a8883a;padding:4px 6px;font-size:11px";
      queue.appendChild(chip);
    }
    for (const site of world.assemblies || []) {
      if (site.buildingId !== e.id) continue;
      const chip = document.createElement("span");
      const label = civDisplayName(faction, site.type, "unit");
      chip.textContent = `${label} ${Math.ceil(ticksToSec(Math.max(0, site.buildTotalTicks - site.buildTicks)))}s`;
      chip.style.cssText = "border:1px solid #8a6a2a;padding:4px 6px;font-size:11px";
      queue.appendChild(chip);
    }
  }
}

function iconBtn(label, icon, fn) {
  const b = document.createElement("button");
  b.className = "cmd";
  if (icon) {
    const img = document.createElement("img");
    img.src = icon;
    img.alt = "";
    b.appendChild(img);
    if (/\/icon-/.test(icon)) b.classList.add("framed");
  }
  const s = document.createElement("span");
  s.textContent = label;
  b.appendChild(s);
  b.onclick = fn;
  return b;
}

function facPrefix(faction) {
  if (faction === "gravemark") return "grave";
  if (faction === "stormveil") return "storm";
  if (faction === "ashvein") return "ash";
  if (faction === "cogforged") return "cog";
  return "sun";
}

function bldgSpriteKey(type) {
  if (type === "towncenter") return "tc";
  if (type === "barracks") return "rax";
  return type;
}

function selectionPortrait(e, faction) {
  const fac = facPrefix(faction);
  if (e.kind === "building") return `media/sprites/bldg-${fac}-${bldgSpriteKey(e.type)}.png`;
  const unit = e.type === "titan" ? "titan" : e.type;
  return `media/sprites/portrait-${fac}-${unit}.png`;
}

function buildIcon(type, faction) {
  const key = type === "barracks" ? "barracks" : type === "towncenter" ? "house" : type;
  return `media/sprites/icon-build-${facPrefix(faction)}-${key}.png`;
}

function trainIcon(type, faction) {
  return `media/sprites/icon-train-${facPrefix(faction)}-${type}.png`;
}

function ageIcon(faction) {
  return `media/sprites/icon-age-${facPrefix(faction)}.png`;
}

function bldgThumb(type, faction) {
  return civBuildThumb(faction, type) || `media/sprites/bldg-${facPrefix(faction)}-${bldgSpriteKey(type)}.png`;
}

function btn(label, fn) {
  return iconBtn(label, null, fn);
}

function drawMinimap(world, view) {
  const c = document.getElementById("minimap");
  if (!c) return;
  const ctx = c.getContext("2d", { alpha: false });
  const n = world.N || 48;
  const s = c.width / n;
  const terrain = world.map?.terrain;
  ctx.fillStyle = "#121828";
  ctx.fillRect(0, 0, c.width, c.height);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const idx = z * n + x;
      if (!world.explored.player[idx]) {
        ctx.fillStyle = "#071422";
        ctx.fillRect(x * s, z * s, s + 0.5, s + 0.5);
      } else {
        const mutColor = minimapCellColor(world, idx, true);
        if (mutColor) ctx.fillStyle = `rgb(${mutColor[0]},${mutColor[1]},${mutColor[2]})`;
        else if (terrain) {
          const [r, g, b] = biomeRgb(terrain[idx]);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        } else {
          ctx.fillStyle = "#e2c48a";
        }
        ctx.fillRect(x * s, z * s, s + 0.5, s + 0.5);
        if (!world.visible.player[idx]) {
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(x * s, z * s, s + 0.5, s + 0.5);
        }
      }
    }
  }
  for (const r of world.resources) {
    if (r.kind === "rockblock" || r.amount <= 0) continue;
    const [cx, cz] = [(wx(r) / world.CELL) | 0, (wz(r) / world.CELL) | 0];
    if (!world.explored.player[cz * n + cx]) continue;
    ctx.fillStyle = r.kind === "food" ? "#4c8" : r.kind === "wood" ? "#385" : r.kind === "crystal" ? "#6cf" : "#fc6";
    ctx.fillRect(wx(r) * s * (1 / world.CELL) - 1, wz(r) * s * (1 / world.CELL) - 1, 3, 3);
  }
  for (const b of world.buildings) {
    const [cx, cz] = [(wx(b) / world.CELL) | 0, (wz(b) / world.CELL) | 0];
    if (b.owner !== "player" && !world.explored.player[cz * n + cx]) continue;
    ctx.fillStyle = b.owner === "player" ? "#4af" : b.owner === "enemy" ? "#f45" : "#eee";
    ctx.fillRect(wx(b) * s * (1 / world.CELL) - 2, wz(b) * s * (1 / world.CELL) - 2, 5, 5);
  }
  for (const u of world.units) {
    const [cx, cz] = [(wx(u) / world.CELL) | 0, (wz(u) / world.CELL) | 0];
    if (u.owner !== "player" && (u.layer === "tunnel" || !world.visible.player[cz * n + cx])) continue;
    ctx.fillStyle = u.owner === "player" ? "#9df" : u.owner === "enemy" ? "#f88" : "#8ff";
    ctx.fillRect(wx(u) * s * (1 / world.CELL) - 1, wz(u) * s * (1 / world.CELL) - 1, 2, 2);
  }
  const cam = view.cameraInfo();
  const mapWorld = cam.mapWorld || n * world.CELL;
  const viewW = ((cam.frustum * 2 * (cam.aspect || 1)) / mapWorld) * c.width;
  const viewH = ((cam.frustum * 2) / mapWorld) * c.height;
  ctx.strokeStyle = "#fff";
  ctx.strokeRect((cam.x / mapWorld) * c.width - viewW / 2, (cam.z / mapWorld) * c.height - viewH / 2, viewW, viewH);
}
