export interface PauseViewHandle {
  dispose(): void;
}

export interface PauseViewCallbacks {
  onResume(): void;
  onRestart(): void;
  onMenu(): void;
}

export function mountPauseView(parent: HTMLElement, callbacks: PauseViewCallbacks): PauseViewHandle {
  const root = document.createElement("section");
  root.className = "pause-overlay";
  root.dataset.testid = "pause-overlay";
  root.innerHTML = `<div class="pause-card"><p class="eyebrow">MATCH PAUSED</p><h1>Hold the frontier.</h1><p>Simulation time is stopped. No ticks advance while this panel is open.</p><div class="pause-actions"><button class="button button--primary" data-action="resume" type="button">Resume match</button><button class="button button--quiet" data-action="restart" type="button">Restart match</button><button class="button button--quiet" data-action="menu" type="button">Return to title</button></div></div>`;
  parent.appendChild(root);
  root.querySelector<HTMLButtonElement>("[data-action='resume']")?.addEventListener("click", callbacks.onResume);
  root.querySelector<HTMLButtonElement>("[data-action='restart']")?.addEventListener("click", callbacks.onRestart);
  root.querySelector<HTMLButtonElement>("[data-action='menu']")?.addEventListener("click", callbacks.onMenu);
  return { dispose: () => root.remove() };
}
