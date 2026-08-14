import { createMatch, updateWorld, commandGround, tryPlace, queueUnit, tryAgeUp, idleVillager, selectedEntities, villagerBuildOptions, BUILDINGS, UNITS } from "../sim/engine.js";
import { displayName } from "../data/catalog.js";
import { createRenderer } from "./render.js";
import { beep, haptic, loadSave, showScreen } from "../boot.js";
import { createFramePacer, setText, resolveQuality } from "../perf.js";
import { ensureMatchAssets } from "../cache/assets.js";

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
const SIM_DT = 1 / 60;
const ZOOM_STEP = 4;
const DBL_MS = 400;
const DBL_PX = 36;
let emptyTap = null;
let emptyTapTimer = 0;

export async function startMatch(opts) {
  await ensureMatchAssets();
  stopMatch();
  const save = loadSave();
  world = createMatch(opts);

  showScreen("game");
  document.getElementById("end-banner").classList.add("hidden");
  document.getElementById("pause-modal").classList.add("hidden");
  paused = false;
  lastSelKey = "";
  attackMove = false;
  simAcc = 0;
  hudAcc = 0;
  mapAcc = 0;
  pacer = createFramePacer();

  const viewport = document.getElementById("viewport");
  viewport.innerHTML = "";
  void viewport.offsetHeight;
  const quality = save.settings.quality || "ultra";
  qualityName = quality;
  view = createRenderer(viewport, quality, { reduceMotion: !!save.settings.reduceMotion });
  bindInput(viewport);
  last = performance.now();
  raf = requestAnimationFrame(loop);
  const tc = world.buildings.find((b) => b.owner === "player" && b.type === "towncenter");
  if (tc) view.lookAt(tc.x, tc.z, true);
  world.selection = [];
  renderSelection();
  drawHud(world, true);
  drawMinimap(world, view);
  paintDebugState();
}

export function stopMatch() {
  cancelAnimationFrame(raf);
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
}

export function togglePause(on) {
  paused = on ?? !paused;
  document.getElementById("pause-modal").classList.toggle("hidden", !paused);
}

/* Command hooks for the QA harness. Only installed with ?qa=1 so playtest builds stay untouched. */
if (new URLSearchParams(location.search).get("qa") === "1") {
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
    const before = sel.map((u) => ({ id: u.id, state: u.state, x: round(u.x), z: round(u.z) }));
    commandGround(world, x, z, !!attackMove);
    return {
      ok: true,
      issuedAt: Date.now(),
      worldTick: world.t,
      command: { x, z, attackMove: !!attackMove },
      moved: sel.map((u) => u.id),
      before,
      after: sel.map((u) => ({ id: u.id, state: u.state, x: round(u.x), z: round(u.z) })),
    };
  };

  window.__starhavenTrain = function (buildingId, type) {
    if (!world) return { ok: false, why: "no-match-in-progress" };
    const b = world.buildings.find((x) => x.id === buildingId);
    if (!b) return { ok: false, why: "no-building", buildingId };
    const res = queueUnit(world, b, type);
    return { ok: !!res?.ok, why: res?.why, buildingId, type };
  };
}

function loop(now) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!world || !view) return;

  const scale = pacer.sample(dt * 1000);
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

  if (world.winner) {
    const banner = document.getElementById("end-banner");
    banner.classList.remove("hidden");
    setText("end-title", world.winner === "player" ? "VICTORY" : "DEFEAT");
    setText(
      "end-sub",
      world.winner === "player" ? "The mesa is yours. The Bright Line keeps moving." : "Your Town Center is ash."
    );
  }
}

function paintPerf() {
  const el = document.getElementById("perf-chip");
  if (!el || !pacer || !view?.stats) return;
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

function paintDebugState() {
  if (!world || !view) return;
  const cam = view.cameraInfo();
  const units = [];
  for (const u of world.units) {
    if (u.owner !== "player") continue;
    const p = view.project(u.x, u.z);
    units.push({ id: u.id, type: u.type, x: u.x, z: u.z, state: u.state, sx: p.x, sy: p.y });
  }
  const buildings = [];
  for (const b of world.buildings) {
    if (b.owner !== "player") continue;
    const p = view.project(b.x, b.z);
    buildings.push({ id: b.id, type: b.type, x: b.x, z: b.z, sx: p.x, sy: p.y });
  }
  window.__starhavenState = {
    sel: world.selection.slice(),
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
        commandGround(world, g.x, g.z, true);
        beep(220, 0.05);
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
      view.lookAt(u.x, u.z);
      beep(520);
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
  if (e.button === 2) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
  e.target.setPointerCapture?.(e.pointerId);
  if (pointers.size === 1 && !world.placing) {
    ensureBox(e.clientX, e.clientY);
  }
}

function onMove(e) {
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
    const res = tryPlace(world, "player", world.placing, g.x, g.z);
    world.tip = res.ok ? "Builders inbound." : res.why;
    if (res.ok) {
      beep(380);
      haptic();
      world.placing = null;
    } else beep(140, 0.1, 0.06);
    hideBox();
    renderSelection();
    return;
  }
  if (dist < 14 && g) {
    const hit = pickEntity(world, g.x, g.z);
    if (hit && hit.owner === "player") {
      clearEmptyTap(false);
      world.selection = e.shiftKey ? [...new Set([...world.selection, hit.id])] : [hit.id];
      beep(490, 0.05);
    } else if (hit && hit.owner !== "player") {
      clearEmptyTap(false);
      if (world.selection.length) {
        commandGround(world, g.x, g.z);
        beep(200, 0.06);
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
    commandGround(world, g.x, g.z, attackMove || e.shiftKey);
    beep(240, 0.05);
    haptic(8);
    return;
  }
  const snap = world.selection.slice();
  if (emptyTapTimer) {
    clearTimeout(emptyTapTimer);
    emptyTapTimer = 0;
  }
  emptyTap = { t: now, cx: e.clientX, cy: e.clientY, selection: snap };
  if (!snap.length) return;
  emptyTapTimer = setTimeout(() => {
    emptyTapTimer = 0;
    emptyTap = null;
    if (!world) return;
    world.selection = [];
    renderSelection();
    paintDebugState();
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
    const g = projectApprox(u.x, u.z);
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
  let bd = 1.8;
  for (const e of [...world.units, ...world.buildings]) {
    const d = Math.hypot(e.x - x, e.z - z);
    const rad = e.kind === "building" ? (e.size || 2) * 1.15 : 1.15;
    if (d < rad && d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

function drawHud(world) {
  const p = world.players.player;
  setText("res-food", p.stock.food | 0);
  setText("res-wood", p.stock.wood | 0);
  setText("res-crystal", p.stock.crystal | 0);
  setText("res-ore", p.stock.ore | 0);
  setText("res-pop", `${p.pop}/${p.popCap}`);
  setText("rate-food", p.rates.food ? `+${p.rates.food.toFixed(1)}/s` : "");
  setText("rate-wood", p.rates.wood ? `+${p.rates.wood.toFixed(1)}/s` : "");
  setText("rate-crystal", p.rates.crystal ? `+${p.rates.crystal.toFixed(1)}/s` : "");
  setText("rate-ore", p.rates.ore ? `+${p.rates.ore.toFixed(1)}/s` : "");
  setText("age-label", p.aging > 0 ? `AGING ${p.aging | 0}s` : ["AGE I · FOUNDATION", "AGE II · RADIANT EXPANSE", "AGE III · ASCENSION"][p.age - 1]);
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
  const name = e.kind === "unit" ? displayName(e.type, faction, "unit") : displayName(e.type, faction, "building");
  document.getElementById("sel-name").textContent = sel.length > 1 ? `${sel.length} SELECTED` : name;
  document.getElementById("sel-meta").textContent = e.kind === "unit" ? UNITS[e.type].role : BUILDINGS[e.type].name;
  const hp = e.hp / e.maxHp;
  document.getElementById("sel-hp-bar").style.width = `${Math.max(0, hp) * 100}%`;
  document.getElementById("sel-hp-text").textContent = `${e.hp | 0}/${e.maxHp | 0}`;
  const portrait = document.getElementById("sel-portrait");
  if (portrait) {
    const grave = faction === "gravemark";
    if (e.kind === "building") {
      const fac = grave ? "grave" : "sun";
      const type = e.type === "towncenter" ? "tc" : e.type === "house" ? "house" : e.type === "wonder" ? "wonder" : e.type === "barracks" ? "rax" : "mill";
      portrait.src = `media/sprites/bldg-${fac}-${type}.png`;
    } else if (e.type === "strider") {
      portrait.src = grave ? "media/sprites/unit-grave-strider.png" : "media/sprites/unit-sun-strider.png";
    } else if (e.type === "siege" || e.type === "titan") {
      portrait.src = grave ? "media/sprites/unit-grave-siege.png" : "media/sprites/unit-sun-siege.png";
    } else {
      portrait.src = grave ? "media/sprites/portrait-gravemark.png" : "media/sprites/portrait-sunwoven.png";
    }
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
        iconBtn(BUILDINGS[t].name, bldgThumb(t, faction), () => {
          world.placing = t;
          world.tip = `Place ${BUILDINGS[t].name}. Tap the mesa.`;
          beep(300, 0.05);
        })
      );
    }
  }
  if (e.kind === "building" && e.owner === "player" && e.built >= 1) {
    const produces = BUILDINGS[e.type].produces || [];
    for (const t of produces) {
      cmds.appendChild(
        btn(UNITS[t].name, () => {
          const r = queueUnit(world, e, t);
          world.tip = r.ok ? `Training ${UNITS[t].name}` : r.why;
          beep(r.ok ? 400 : 140);
          renderSelection();
        })
      );
    }
    if (e.type === "towncenter") {
      cmds.appendChild(
        btn("Age Up", () => {
          const r = tryAgeUp(world, "player");
          world.tip = r.ok ? "The Town Center chants. Age up begun." : r.why;
          beep(r.ok ? 260 : 140, 0.12);
        })
      );
    }
    for (const q of e.queue) {
      const chip = document.createElement("span");
      chip.textContent = `${UNITS[q.type].name} ${q.left | 0}s`;
      chip.style.cssText = "border:1px solid #a8883a;padding:4px 6px;font-size:11px";
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

function bldgThumb(type, faction) {
  const fac = faction === "gravemark" ? "grave" : "sun";
  const key = type === "towncenter" ? "tc" : type === "house" ? "house" : type === "wonder" ? "wonder" : type === "barracks" ? "rax" : "mill";
  return `media/sprites/bldg-${fac}-${key}.png`;
}

function btn(label, fn) {
  return iconBtn(label, null, fn);
}

function drawMinimap(world, view) {
  const c = document.getElementById("minimap");
  if (!c) return;
  const ctx = c.getContext("2d", { alpha: false });
  const s = c.width / 48;
  ctx.fillStyle = "#163a68";
  ctx.fillRect(0, 0, c.width, c.height);
  for (let z = 0; z < 48; z++) {
    for (let x = 0; x < 48; x++) {
      if (!world.explored.player[z * 48 + x]) {
        ctx.fillStyle = "#071422";
        ctx.fillRect(x * s, z * s, s + 0.5, s + 0.5);
      } else {
        ctx.fillStyle = "#e2c48a";
        ctx.fillRect(x * s, z * s, s + 0.5, s + 0.5);
        if (!world.visible.player[z * 48 + x]) {
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(x * s, z * s, s + 0.5, s + 0.5);
        }
      }
    }
  }
  for (const r of world.resources) {
    if (r.kind === "rockblock" || r.amount <= 0) continue;
    const [cx, cz] = [(r.x / 2) | 0, (r.z / 2) | 0];
    if (!world.explored.player[cz * 48 + cx]) continue;
    ctx.fillStyle = r.kind === "food" ? "#4c8" : r.kind === "wood" ? "#385" : r.kind === "crystal" ? "#6cf" : "#fc6";
    ctx.fillRect(r.x * s * 0.5 - 1, r.z * s * 0.5 - 1, 3, 3);
  }
  for (const b of world.buildings) {
    const [cx, cz] = [(b.x / 2) | 0, (b.z / 2) | 0];
    if (b.owner !== "player" && !world.explored.player[cz * 48 + cx]) continue;
    ctx.fillStyle = b.owner === "player" ? "#4af" : b.owner === "enemy" ? "#f45" : "#eee";
    ctx.fillRect(b.x * s * 0.5 - 2, b.z * s * 0.5 - 2, 5, 5);
  }
  for (const u of world.units) {
    const [cx, cz] = [(u.x / 2) | 0, (u.z / 2) | 0];
    if (u.owner !== "player" && !world.visible.player[cz * 48 + cx]) continue;
    ctx.fillStyle = u.owner === "player" ? "#9df" : u.owner === "enemy" ? "#f88" : "#8ff";
    ctx.fillRect(u.x * s * 0.5 - 1, u.z * s * 0.5 - 1, 2, 2);
  }
  const cam = view.cameraInfo();
  ctx.strokeStyle = "#fff";
  ctx.strokeRect((cam.x / 96) * c.width - 18, (cam.z / 96) * c.height - 12, 36, 24);
}
