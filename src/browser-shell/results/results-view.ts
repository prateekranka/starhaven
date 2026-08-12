import type { MatchEndResult } from "../../game/sim/victory";

export interface ResultsViewHandle {
  dispose(): void;
}

export interface ResultsViewCallbacks {
  onRematch(): void;
  onMenu(): void;
}

export function mountResultsView(parent: HTMLElement, result: MatchEndResult, callbacks: ResultsViewCallbacks): ResultsViewHandle {
  const root = document.createElement("main");
  root.className = "results-screen";
  root.dataset.testid = "results-screen";
  const winnerLabel = result.winner === "sunwoven" ? "Sunwoven" : "Gravemark";
  const reasonLabel = result.reason === "headquartersDestroyed" ? "Headquarters destroyed" : result.reason === "resonanceVictory" ? "Resonance victory" : "12:00 time resolution";
  const duration = `${Math.floor(result.durationSeconds / 60).toString().padStart(2, "0")}:${Math.floor(result.durationSeconds % 60).toString().padStart(2, "0")}`;
  root.innerHTML = `<header class="topbar"><div class="brand-lockup"><span class="brand-lockup__sigil" aria-hidden="true">✦</span><span><strong>STARHAVEN</strong><small>BRIGHT FRONTIER</small></span></div><span class="build-pill">MATCH COMPLETE</span></header><section class="results-card"><p class="eyebrow">${winnerLabel.toUpperCase()} HOLDS THE BREACH</p><h1>${winnerLabel}<br /><em>victorious.</em></h1><p class="results-reason">${reasonLabel}</p><dl class="results-facts"><div><dt>FACTION</dt><dd data-result="faction">${winnerLabel}</dd></div><div><dt>OUTCOME</dt><dd data-result="outcome">${reasonLabel}</dd></div><div><dt>DURATION</dt><dd data-result="duration">${duration}</dd></div><div><dt>BUILD</dt><dd data-result="build">${result.buildIdentity}</dd></div><div><dt>BALANCE</dt><dd data-result="balance">v${result.balanceVersion}</dd></div><div><dt>SEED</dt><dd data-result="seed">${result.seed >>> 0}</dd></div><div><dt>CHECKSUM</dt><dd data-result="checksum">${result.finalChecksum}</dd></div></dl><div class="results-actions"><button class="button button--primary" data-action="rematch" type="button">Rematch with new seed ↗</button><button class="button button--quiet" data-action="menu" type="button">Return to title</button></div></section>`;
  parent.appendChild(root);
  root.querySelector<HTMLButtonElement>("[data-action='rematch']")?.addEventListener("click", callbacks.onRematch);
  root.querySelector<HTMLButtonElement>("[data-action='menu']")?.addEventListener("click", callbacks.onMenu);
  return { dispose: () => root.remove() };
}
