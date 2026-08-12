import * as THREE from "three";
import { createFoundationSimulation } from "../game/sim/simulation";
import { PointerController } from "../input/pointer-controller";
import { createMatchHud } from "../hud/match-hud";
import { DEFAULT_SAFE_AREA } from "../hud/safe-area";
import { createTerrain } from "./terrain";
import { DimetricCamera, type ZoomLevel } from "./camera";
import { StarhavenRenderer } from "./renderer";
import { UnitSpriteBatch } from "./sprite-batch";

export function mountFoundationMatch(root: HTMLElement, seed = 0x4d455249): void {
  root.innerHTML = `<main class="match-screen" data-testid="foundation-match"><canvas class="match-canvas"></canvas><button class="match-exit" type="button">Exit foundation view</button></main>`;
  const surface = root.querySelector<HTMLElement>(".match-screen");
  const canvas = root.querySelector<HTMLCanvasElement>(".match-canvas");
  if (!surface || !canvas) throw new Error("Match surface failed to mount");
  const simulation = createFoundationSimulation(seed);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c1023);
  const camera = new DimetricCamera();
  const renderer = new StarhavenRenderer({ canvas });
  const terrain = createTerrain();
  const units = new UnitSpriteBatch();
  scene.add(terrain, units.mesh);
  const hud = createMatchHud(surface);
  const pointer = new PointerController(canvas, (action) => {
    if (action.type === "move") simulation.queueCommand({ issuer: "sunwoven", type: "move", entityIds: [1, 2, 3], targetXQ10: action.xQ10, targetYQ10: action.yQ10 });
    if (action.type === "select") simulation.queueCommand({ issuer: "sunwoven", type: "select", entityIds: action.entityIds });
  });
  const resize = (): void => { const width = surface.clientWidth || window.innerWidth; const height = surface.clientHeight || window.innerHeight; renderer.resize(width, height); camera.setViewport(width, height); };
  resize();
  const onResize = (): void => resize();
  window.addEventListener("resize", onResize);
  let previous = performance.now();
  let accumulator = 0;
  let frame = 0;
  const renderFrame = (now: number): void => {
    const elapsed = Math.min(100, now - previous);
    previous = now;
    accumulator += elapsed;
    while (accumulator >= 50) { simulation.step(); accumulator -= 50; }
    units.update(simulation.readState(), camera.camera);
    hud.update(simulation.readState(), pointer.getState());
    renderer.render(scene, camera.camera);
    frame = requestAnimationFrame(renderFrame);
  };
  frame = requestAnimationFrame(renderFrame);
  surface.querySelector<HTMLButtonElement>(".match-exit")?.addEventListener("click", () => {
    cancelAnimationFrame(frame);
    pointer.dispose();
    hud.dispose();
    units.dispose();
    scene.clear();
    renderer.dispose();
    window.removeEventListener("resize", onResize);
    root.innerHTML = "";
  });
  camera.setZoom(32 as ZoomLevel);
  hud.setSafeArea(DEFAULT_SAFE_AREA);
}
