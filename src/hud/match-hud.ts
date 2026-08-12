import type { MatchSnapshot } from "../game/sim/state";
import { applySafeArea, type SafeAreaInsets } from "./safe-area";
import { modeLabel, type InputState } from "../input/input-state";

export interface MatchHud {
  root: HTMLElement;
  update(snapshot: MatchSnapshot, input: InputState): void;
  setSafeArea(insets: SafeAreaInsets): void;
  dispose(): void;
}

export function createMatchHud(parent: HTMLElement): MatchHud {
  const root = document.createElement("div");
  root.className = "match-hud";
  root.innerHTML = `<div class="match-hud__top"><div class="match-hud__brand">STARHAVEN <span>MERIDIAN BREACH</span></div><div class="match-hud__status" data-hud="tick">TICK 00000</div></div><div class="match-hud__bottom"><div class="mode-chip" data-hud="mode">Idle</div><button class="hud-cancel" data-hud="cancel" type="button">Cancel</button><div class="match-hud__seed" data-hud="seed">SEED —</div></div><div class="safe-area-debug" data-hud="safe">SAFE AREA 0 / 0 / 0 / 0</div>`;
  parent.appendChild(root);
  const tick = root.querySelector<HTMLElement>("[data-hud='tick']");
  const mode = root.querySelector<HTMLElement>("[data-hud='mode']");
  const seed = root.querySelector<HTMLElement>("[data-hud='seed']");
  const safe = root.querySelector<HTMLElement>("[data-hud='safe']");
  return {
    root,
    update(snapshot, input) {
      if (tick) tick.textContent = `TICK ${String(snapshot.tick).padStart(5, "0")} / ${snapshot.checksum}`;
      if (mode) mode.textContent = modeLabel(input);
      if (seed) seed.textContent = `SEED ${snapshot.seed.toString(16).toUpperCase()}`;
    },
    setSafeArea(insets) {
      applySafeArea(root, insets);
      if (safe) safe.textContent = `SAFE AREA ${insets.top} / ${insets.right} / ${insets.bottom} / ${insets.left}`;
    },
    dispose() { root.remove(); },
  };
}
