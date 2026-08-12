import { mountPauseView, type PauseViewHandle } from "./pause/pause-view";
import { mountResultsView, type ResultsViewHandle } from "./results/results-view";
import { readSetupValues, setupMarkup } from "./setup/setup-view";
import { mountPlayableMatch, type PlayableMatchHandle } from "../render/playable-view";
import type { MatchConfig } from "../game/sim/match";
import type { MatchEndResult } from "../game/sim/victory";

type Screen = "title" | "setup" | "match" | "results";

const BUILD_LABEL = "C4 / GAMEPLAY VERTICAL SLICE";

export interface BrowserShellOptions {
  demoMode?: boolean;
}

export function startBrowserShell(root: HTMLElement, options: BrowserShellOptions = {}): void {
  let screen: Screen = "title";
  let config: MatchConfig | null = null;
  let result: MatchEndResult | null = null;
  let activeMatch: PlayableMatchHandle | null = null;
  let pauseView: PauseViewHandle | null = null;
  let resultsView: ResultsViewHandle | null = null;

  const render = (): void => {
    if (screen === "title") {
      disposeTransientViews();
      root.innerHTML = titleMarkup();
      root.querySelector<HTMLButtonElement>("[data-action='start']")?.addEventListener("click", () => {
        screen = "setup";
        render();
      });
      root.querySelector<HTMLButtonElement>("[data-action='factions']")?.addEventListener("click", () => {
        window.alert("Sunwoven favors light, range, and momentum. Gravemark favors weight, armor, and control.");
      });
      return;
    }

    if (screen === "setup") {
      disposeTransientViews();
      root.innerHTML = setupMarkup();
      wireSetup();
      return;
    }

    if (screen === "match") {
      if (config === null) {
        screen = "setup";
        render();
        return;
      }
      activeMatch = mountPlayableMatch(root, config, {
        demoMode: options.demoMode,
        callbacks: {
          onPause: () => {
            activeMatch?.pause();
            pauseView?.dispose();
            pauseView = mountPauseView(root, {
              onResume: () => {
                pauseView?.dispose();
                pauseView = null;
                activeMatch?.resume();
              },
              onRestart: () => {
                pauseView?.dispose();
                pauseView = null;
                activeMatch?.dispose();
                activeMatch = null;
                render();
              },
              onMenu: () => {
                pauseView?.dispose();
                pauseView = null;
                activeMatch?.dispose();
                activeMatch = null;
                screen = "title";
                render();
              },
            });
          },
          onExit: () => {
            activeMatch?.dispose();
            activeMatch = null;
            screen = "title";
            render();
          },
          onRestart: () => {
            activeMatch?.dispose();
            activeMatch = null;
            render();
          },
          onResults: (matchResult) => {
            activeMatch?.dispose();
            activeMatch = null;
            result = matchResult;
            screen = "results";
            render();
          },
        },
      });
      return;
    }

    if (result === null) {
      screen = "title";
      render();
      return;
    }
    disposeTransientViews();
    root.innerHTML = "";
    resultsView = mountResultsView(root, result, {
      onRematch: () => {
        const previousSeed = result?.seed ?? 0;
        let nextSeed = secureSeed();
        while (nextSeed === previousSeed) nextSeed = secureSeed();
        config = config ? { ...config, seed: nextSeed } : null;
        result = null;
        resultsView?.dispose();
        resultsView = null;
        screen = "match";
        render();
      },
      onMenu: () => {
        resultsView?.dispose();
        resultsView = null;
        result = null;
        screen = "title";
        render();
      },
    });
  };

  const wireSetup = (): void => {
    const choices = [...root.querySelectorAll<HTMLButtonElement>("[data-faction]")];
    choices.forEach((choice) => choice.addEventListener("click", () => {
      choices.forEach((candidate) => {
        const active = candidate === choice;
        candidate.classList.toggle("setup-choice--active", active);
        const check = candidate.querySelector<HTMLElement>(".setup-choice__check");
        if (check) check.textContent = active ? "✓" : "";
      });
    }));
    root.querySelector<HTMLButtonElement>("[data-action='back']")?.addEventListener("click", () => {
      screen = "title";
      render();
    });
    root.querySelector<HTMLButtonElement>("[data-action='launch']")?.addEventListener("click", () => {
      const values = readSetupValues(root, secureSeed);
      if ("error" in values) {
        const error = root.querySelector<HTMLElement>("[data-setup='error']");
        if (error) {
          error.hidden = false;
          error.textContent = values.error;
        }
        return;
      }
      config = { seed: values.seed, playerFaction: values.faction, difficulty: values.difficulty, buildIdentity: BUILD_LABEL } satisfies MatchConfig;
      screen = "match";
      render();
    });
  };

  const disposeTransientViews = (): void => {
    pauseView?.dispose();
    pauseView = null;
    resultsView?.dispose();
    resultsView = null;
  };

  render();
}

function secureSeed(): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0] ?? 0;
}

function titleMarkup(): string {
  return `
    <main class="title-screen" data-testid="title-screen">
      <div class="title-screen__backdrop" aria-hidden="true">
        <span class="backdrop-orbit backdrop-orbit--one"></span>
        <span class="backdrop-orbit backdrop-orbit--two"></span>
        <span class="backdrop-star backdrop-star--one">✦</span>
        <span class="backdrop-star backdrop-star--two">·</span>
        <span class="backdrop-star backdrop-star--three">✦</span>
      </div>
      <header class="topbar">
        <div class="brand-lockup">
          <span class="brand-lockup__sigil" aria-hidden="true">✦</span>
          <span><strong>STARHAVEN</strong><small>BRIGHT FRONTIER</small></span>
        </div>
        <span class="build-pill">${BUILD_LABEL}</span>
      </header>
      <section class="title-hero">
        <div class="title-hero__copy">
          <p class="eyebrow">THE MERIDIAN BREACH</p>
          <h1>Hold the<br /><em>bright frontier.</em></h1>
          <p class="lede">A tactical real-time skirmish where two frontier cultures race to awaken the Meridian Engine.</p>
          <div class="title-actions">
            <button class="button button--primary" data-action="start" type="button">
              <span>Start skirmish</span><span aria-hidden="true">↗</span>
            </button>
            <button class="button button--quiet" data-action="factions" type="button">Explore factions</button>
          </div>
        </div>
        <div class="hero-card" aria-label="Meridian Breach preview">
          <div class="hero-card__glow"></div>
          <div class="hero-card__engine"><span></span><span></span><span></span></div>
          <div class="hero-card__ridge hero-card__ridge--back"></div>
          <div class="hero-card__ridge hero-card__ridge--front"></div>
          <div class="hero-card__token hero-card__token--sun">✦</div>
          <div class="hero-card__token hero-card__token--gravemark">◇</div>
          <div class="hero-card__label"><span>MERIDIAN ENGINE</span><small>READY / 20 HZ</small></div>
        </div>
      </section>
      <section class="faction-strip" aria-label="Factions">
        <article class="faction-card faction-card--sunwoven">
          <span class="faction-card__token">✦</span><div><p>SUNWOVEN</p><small>Light, range, momentum</small></div><span class="faction-card__arrow">↗</span>
        </article>
        <article class="faction-card faction-card--gravemark">
          <span class="faction-card__token">◇</span><div><p>GRAVEMARK</p><small>Weight, armor, control</small></div><span class="faction-card__arrow">↗</span>
        </article>
      </section>
      <footer class="title-footer"><span>OFFLINE SKIRMISH</span><span>•</span><span>WEBGL2 GRAPHICS</span><span>•</span><span>BUILD ${BUILD_LABEL}</span></footer>
    </main>
  `;
}
