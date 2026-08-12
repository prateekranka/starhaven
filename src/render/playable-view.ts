import * as THREE from "three";
import { runBaselineAi } from "../game/ai/controller";
import { createFeedbackController } from "../feedback/feedback";
import { mountSettingsView, type SettingsViewHandle } from "../browser-shell/settings/settings-view";
import { BALANCE_V1 } from "../game/content/balance.v1";
import type { Faction } from "../game/content/schema";
import { SkirmishMatch, type MatchConfig, type MatchEvent, type SkirmishSnapshot } from "../game/sim/match";
import type { MatchEndResult } from "../game/sim/victory";
import { PointerController } from "../input/pointer-controller";
import { createMatchHud } from "../hud/match-hud";
import { DEFAULT_SAFE_AREA } from "../hud/safe-area";
import { DimetricCamera } from "./camera";
import { StarhavenRenderer } from "./renderer";
import { createTerrain } from "./terrain";
import { UnitSpriteBatch } from "./sprite-batch";
import { OcclusionSilhouettePass } from "./occlusion-pass";
import { PERFORMANCE_BUDGET } from "./performance-budget";
import { q10FromWorld, worldFromQ10 } from "../game/sim/fixed";

const WORLD_OFFSET_X = 24;
const WORLD_OFFSET_Y = 16;
const DEMO_TICKS_PER_FRAME = 120;

const OBJECTIVES = [
  { key: "northOutpost" as const, kind: "outpostNorth" as const, label: "NORTH OUTPOST", x: 22, y: 8 },
  { key: "southOutpost" as const, kind: "outpostSouth" as const, label: "SOUTH OUTPOST", x: 22, y: 24 },
  { key: "engine" as const, kind: "engine" as const, label: "MERIDIAN ENGINE", x: 24, y: 16 },
];

export interface PlayableMatchCallbacks {
  onPause(): void;
  onExit(): void;
  onRestart(): void;
  onResults(result: MatchEndResult): void;
}

export interface PlayableMatchOptions {
  demoMode?: boolean;
  callbacks: PlayableMatchCallbacks;
}

export interface PlayableMatchHandle {
  match: SkirmishMatch;
  pause(): void;
  resume(): void;
  dispose(): void;
}

export function mountPlayableMatch(root: HTMLElement, config: MatchConfig, options: PlayableMatchOptions): PlayableMatchHandle {
  root.innerHTML = `<main class="match-screen playable-match" data-testid="playable-match"><canvas class="match-canvas" aria-label="Meridian Breach game board"></canvas><button class="match-exit" data-action="exit" type="button">← Title</button><div class="match-runtime-label" data-testid="runtime-placeholder">MATCH RUNTIME / 20 HZ</div><section class="playable-panel" aria-label="Match status"><div class="playable-panel__line"><span class="playable-panel__label">FLUX</span><strong data-match="flux">260</strong><span class="playable-panel__label">POP</span><strong data-match="population">3 / 18</strong><span class="playable-panel__label">AI</span><strong data-match="ai">Opening</strong></div><div class="playable-panel__line"><span class="playable-panel__label">NORTH</span><strong data-match="north">NEUTRAL</strong><span class="playable-panel__label">SOUTH</span><strong data-match="south">NEUTRAL</strong><span class="playable-panel__label">ENGINE</span><strong data-match="engine">DORMANT</strong></div></section><section class="playable-events" aria-live="polite"><p class="playable-events__title">EVENT LOG</p><div data-match="events">Awaiting first order.</div></section><section class="playable-actions" aria-label="Match actions"><button data-action="select" type="button">Select force</button><button data-action="move" type="button">Move to Engine</button><button data-action="attack" type="button">Attack</button><button data-action="build" type="button">Build Lattice</button><button data-action="produce" type="button">Produce</button><button data-action="settings" type="button" aria-label="Open match settings">Settings</button><button class="playable-actions__pause" data-action="pause" type="button">Pause</button></section></main>`;
  const surface = root.querySelector<HTMLElement>(".match-screen");
  const canvas = root.querySelector<HTMLCanvasElement>(".match-canvas");
  if (!surface || !canvas) throw new Error("Playable match surface failed to mount");

  const match = new SkirmishMatch(config);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c1023);
  const camera = new DimetricCamera();
  const feedback = createFeedbackController();
  const renderer = new StarhavenRenderer({ canvas, quality: feedback.settings().renderQuality });
  surface.dataset.maxCombinedUnits = String(PERFORMANCE_BUDGET.maxCombinedUnits);
  surface.dataset.maxProjectiles = String(PERFORMANCE_BUDGET.maxProjectiles);
  surface.dataset.renderQuality = feedback.settings().renderQuality;
  surface.dataset.pixelRatio = String(renderer.pixelRatio());
  const terrain = createTerrain();
  const objectiveLayer = createObjectiveLayer();
  const units = new UnitSpriteBatch();
  const occlusion = new OcclusionSilhouettePass();
  scene.add(terrain, objectiveLayer, units.mesh, occlusion.group);
  const hud = createMatchHud(surface);
  const selectedFaction = config.playerFaction;
  const aiFaction: Faction = selectedFaction === "sunwoven" ? "gravemark" : "sunwoven";
  let latestAi = "Opening";
  let latestEvents: MatchEvent[] = [];
  let paused = false;
  let disposed = false;
  let resultReported = false;
  let animationFrame = 0;
  let previous = performance.now();
  let accumulator = 0;
  let settingsView: SettingsViewHandle | null = null;

  const pointer = new PointerController(canvas, (action) => {
    if (action.type === "move") {
      match.queueMove(selectedFaction, selectedIds(), action.xQ10, action.yQ10);
      feedback.emit("orderAccepted");
    }
    if (action.type === "attack") {
      const target = match.snapshot().units.find((unit) => unit.faction !== selectedFaction && unit.health > 0);
      if (target) {
        match.queueAttack(selectedFaction, selectedIds(), target.id);
        feedback.emit("orderAccepted");
      } else feedback.emit("invalidOrder");
    }
  });
  selectOwnedUnits();

  root.querySelector<HTMLButtonElement>("[data-action='select']")?.addEventListener("click", selectOwnedUnits);
  root.querySelector<HTMLButtonElement>("[data-action='move']")?.addEventListener("click", () => {
    match.queueMove(selectedFaction, selectedIds(), q10FromWorld(24), q10FromWorld(16));
    feedback.emit("orderAccepted");
  });
  root.querySelector<HTMLButtonElement>("[data-action='attack']")?.addEventListener("click", () => {
    const target = match.snapshot().units.find((unit) => unit.faction !== selectedFaction && unit.health > 0);
    if (target) {
      match.queueAttack(selectedFaction, selectedIds(), target.id);
      feedback.emit("orderAccepted");
    } else feedback.emit("invalidOrder");
  });
  root.querySelector<HTMLButtonElement>("[data-action='build']")?.addEventListener("click", () => {
    const builder = match.snapshot().units.find((unit) => unit.faction === selectedFaction && (unit.kind === "loomkeeper" || unit.kind === "prospector") && unit.health > 0);
    if (builder) {
      match.queueBuild(selectedFaction, [builder.id], "latticeField", q10FromWorld(22), q10FromWorld(selectedFaction === "sunwoven" ? 8 : 24));
      feedback.emit("orderAccepted");
    } else feedback.emit("invalidOrder");
  });
  root.querySelector<HTMLButtonElement>("[data-action='produce']")?.addEventListener("click", () => {
    match.queueProduction(selectedFaction, selectedFaction === "sunwoven" ? "gleamrunner" : "stoneguard");
    feedback.emit("orderAccepted");
  });
  root.querySelector<HTMLButtonElement>("[data-action='settings']")?.addEventListener("click", () => {
    settingsView?.dispose();
    settingsView = mountSettingsView(surface, feedback, () => {
      settingsView?.dispose();
      settingsView = null;
    }, (settings) => {
      renderer.setQuality(settings.renderQuality);
      surface.dataset.renderQuality = settings.renderQuality;
      surface.dataset.pixelRatio = String(renderer.pixelRatio());
    });
  });
  root.querySelector<HTMLButtonElement>("[data-action='pause']")?.addEventListener("click", options.callbacks.onPause);
  root.querySelector<HTMLButtonElement>("[data-action='exit']")?.addEventListener("click", options.callbacks.onExit);

  const resize = (): void => {
    const width = surface.clientWidth || window.innerWidth;
    const height = surface.clientHeight || window.innerHeight;
    renderer.resize(width, height);
    camera.setViewport(width, height);
  };
  resize();
  camera.setZoom(32);
  const onResize = (): void => resize();
  window.addEventListener("resize", onResize);

  const applyDemoTimeline = (): void => {
    if (!options.demoMode) return;
    if (match.tick === 1) match.setObjectiveOwner("outpostNorth", "sunwoven");
    if (match.tick === 4) match.setObjectiveOwner("outpostSouth", "sunwoven");
    if (match.tick === 4) match.queueBuild("sunwoven", [2], "latticeField", q10FromWorld(22), q10FromWorld(8));
    if (match.tick === 4) match.queueProduction("sunwoven", "gleamrunner");
    if (match.tick === 4) match.forceFracture();
    if (match.tick === 12_590) match.setObjectiveOwner("engine", "sunwoven");
    if (match.tick === 12_600) {
      match.setCalibration("sunwoven", BALANCE_V1.resonance.calibrationTicks);
      match.setResonance("sunwoven", BALANCE_V1.resonance.victoryMilli - 100);
    }
  };

  const advanceOneTick = (): void => {
    const events = match.step();
    latestEvents = [...events, ...latestEvents].slice(0, 5);
    if (events.some((event) => event.type === "fractureOpened")) feedback.emit("fracture");
    applyDemoTimeline();
    const decision = options.demoMode ? null : runBaselineAi(match, aiFaction, config.difficulty);
    if (decision) latestAi = decision.state;
  };

  const renderFrame = (now: number): void => {
    if (disposed) return;
    const elapsed = Math.min(100, now - previous);
    previous = now;
    if (!paused) {
      if (options.demoMode) {
        for (let index = 0; index < DEMO_TICKS_PER_FRAME && !match.ended; index += 1) advanceOneTick();
      } else {
        accumulator += elapsed;
        while (accumulator >= BALANCE_V1.tickMs && !match.ended) {
          advanceOneTick();
          accumulator -= BALANCE_V1.tickMs;
        }
      }
    }
    const snapshot = match.snapshot();
    updateObjectiveLayer(objectiveLayer, snapshot);
    const selected = new Set(pointer.getState().selectedIds);
    units.update({ units: snapshot.units.map((unit) => ({ ...unit, selected: selected.has(unit.id) })) }, camera.camera);
    occlusion.update(snapshot, selectedFaction, selected);
    hud.update(snapshot, pointer.getState());
    updatePanel(root, snapshot, latestAi, latestEvents, config);
    renderer.render(scene, camera.camera);
    if (match.ended && !resultReported) {
      resultReported = true;
      feedback.emit("matchEnded");
      options.callbacks.onResults(match.ended);
      return;
    }
    animationFrame = requestAnimationFrame(renderFrame);
  };
  animationFrame = requestAnimationFrame(renderFrame);
  hud.setSafeArea(DEFAULT_SAFE_AREA);

  return {
    match,
    pause: () => { paused = true; },
    resume: () => { paused = false; previous = performance.now(); accumulator = 0; },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(animationFrame);
      pointer.dispose();
      settingsView?.dispose();
      settingsView = null;
      feedback.dispose();
      hud.dispose();
      units.dispose();
      occlusion.dispose();
      objectiveLayer.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      });
      terrain.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      });
      scene.clear();
      renderer.dispose();
      window.removeEventListener("resize", onResize);
    },
  };

  function selectedIds(): number[] {
    const ids = pointer.getState().selectedIds;
    return ids.length > 0 ? ids : match.snapshot().units.filter((unit) => unit.faction === selectedFaction && unit.health > 0).map((unit) => unit.id);
  }

  function selectOwnedUnits(): void {
    pointer.setSelection(match.snapshot().units.filter((unit) => unit.faction === selectedFaction && unit.health > 0).map((unit) => unit.id));
  }
}

function createObjectiveLayer(): THREE.Group {
  const group = new THREE.Group();
  for (const objective of OBJECTIVES) {
    const marker = new THREE.Mesh(new THREE.CircleGeometry(objective.kind === "engine" ? 1.4 : 1, 8), new THREE.MeshBasicMaterial({ color: 0x4fc9ca, transparent: true, opacity: 0.8, depthWrite: false }));
    marker.position.set(objective.x - WORLD_OFFSET_X, objective.y - WORLD_OFFSET_Y, objective.kind === "engine" ? 0.22 : 0.16);
    marker.userData.objectiveKey = objective.key;
    group.add(marker);
  }
  return group;
}

function updateObjectiveLayer(group: THREE.Group, snapshot: SkirmishSnapshot): void {
  for (const [index, objective] of OBJECTIVES.entries()) {
    const marker = group.children[index];
    if (!(marker instanceof THREE.Mesh)) continue;
    const state = objective.key === "engine" ? snapshot.engine : snapshot.outposts[objective.key];
    const material = marker.material as THREE.MeshBasicMaterial;
    material.color.set(state.owner === "sunwoven" ? 0xf8d66d : state.owner === "gravemark" ? 0xc24b8e : objective.kind === "engine" ? 0x6ff4e5 : 0x4fc9ca);
    material.opacity = state.owner === null ? 0.62 : 0.9;
    marker.scale.setScalar(state.owner === null ? 1 : 1.15);
  }
}

function updatePanel(root: HTMLElement, snapshot: SkirmishSnapshot, aiState: string, events: readonly MatchEvent[], config: MatchConfig): void {
  const faction = snapshot.factions[config.playerFaction];
  const ownerLabel = (owner: Faction | null): string => owner === null ? "NEUTRAL" : owner === config.playerFaction ? "YOURS" : "ENEMY";
  const setText = (selector: string, value: string): void => {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) element.textContent = value;
  };
  setText("[data-match='flux']", String(Math.floor(faction.fluxMilli / 1_000)));
  setText("[data-match='population']", `${faction.population} / ${BALANCE_V1.populationCap}`);
  setText("[data-match='ai']", aiState);
  setText("[data-match='north']", ownerLabel(snapshot.outposts.northOutpost.owner));
  setText("[data-match='south']", ownerLabel(snapshot.outposts.southOutpost.owner));
  setText("[data-match='engine']", ownerLabel(snapshot.engine.owner));
  const eventElement = root.querySelector<HTMLElement>("[data-match='events']");
  if (eventElement && events.length > 0) eventElement.innerHTML = events.map((event) => `<span>${eventLabel(event)}</span>`).join("");
}

function eventLabel(event: MatchEvent): string {
  if (event.type === "fractureTelegraph") return "⚠ Fracture telegraph: central route destabilizing.";
  if (event.type === "fractureOpened") return "✦ Fracture opened: luminous bridges active.";
  if (event.type === "suddenDeath") return "◆ Sudden death: Resonance calibration complete.";
  if (event.type === "capture") return `${event.objective ?? "Objective"} / ${event.detail ?? "capture"}`;
  if (event.type === "production" || event.type === "construction") return `${event.faction ?? "Faction"} / ${event.detail ?? event.type}`;
  if (event.type === "damage") return `Combat / ${event.damage?.damage ?? event.detail ?? "damage"}`;
  if (event.type === "matchEnded") return `Match ended / ${event.result?.reason ?? "complete"}`;
  return event.type;
}

export function worldPositionForUnit(xQ10: number, yQ10: number): { x: number; y: number } {
  return { x: worldFromQ10(xQ10) - WORLD_OFFSET_X, y: worldFromQ10(yQ10) - WORLD_OFFSET_Y };
}
