type Screen = "title" | "setup" | "placeholder";

const BUILD_LABEL = "C1 / RUNTIME FOUNDATION PENDING";

export function startBrowserShell(root: HTMLElement): void {
  let screen: Screen = "title";

  const render = (): void => {
    if (screen === "title") {
      root.innerHTML = titleMarkup();
      root.querySelector<HTMLButtonElement>("[data-action='start']")?.addEventListener("click", () => {
        screen = "setup";
        render();
      });
      root.querySelector<HTMLButtonElement>("[data-action='factions']")?.addEventListener("click", () => {
        window.alert("Faction encyclopedia arrives with the native shell checkpoint.");
      });
      return;
    }

    if (screen === "setup") {
      root.innerHTML = setupMarkup();
      root.querySelector<HTMLButtonElement>("[data-action='launch']")?.addEventListener("click", () => {
        screen = "placeholder";
        render();
      });
      root.querySelector<HTMLButtonElement>("[data-action='back']")?.addEventListener("click", () => {
        screen = "title";
        render();
      });
      return;
    }

    root.innerHTML = placeholderMarkup();
    root.querySelector<HTMLButtonElement>("[data-action='back']")?.addEventListener("click", () => {
      screen = "title";
      render();
    });
  };

  render();
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
          <div class="hero-card__label"><span>MERIDIAN ENGINE</span><small>UNCLAIMED / 00:00</small></div>
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
      <footer class="title-footer"><span>OFFLINE SKIRMISH</span><span>•</span><span>WEBGL2 GRAPHICS</span><span>•</span><span>BUILD LABEL ${BUILD_LABEL}</span></footer>
    </main>
  `;
}

function setupMarkup(): string {
  return `
    <main class="setup-screen" data-testid="setup-screen">
      <header class="topbar"><div class="brand-lockup"><span class="brand-lockup__sigil" aria-hidden="true">✦</span><span><strong>STARHAVEN</strong><small>BRIGHT FRONTIER</small></span></div><span class="build-pill">MATCH SETUP</span></header>
      <section class="setup-panel">
        <p class="eyebrow">SKIRMISH / FIRST LIGHT</p>
        <h1>Choose your opening.</h1>
        <p class="lede">The match runtime is staged in the next checkpoint. This bounded setup preserves the final control surface.</p>
        <div class="setup-grid">
          <button class="setup-choice setup-choice--active" type="button"><span class="setup-choice__icon">✦</span><span><strong>Sunwoven</strong><small>Agile frontier builders</small></span><span class="setup-choice__check">✓</span></button>
          <button class="setup-choice" type="button"><span class="setup-choice__icon setup-choice__icon--dark">◇</span><span><strong>Gravemark</strong><small>Fortified breach keepers</small></span></button>
        </div>
        <div class="setup-meta"><span><small>MAP</small><strong>MERIDIAN BREACH</strong></span><span><small>DIFFICULTY</small><strong>STANDARD</strong></span><span><small>SEED</small><strong>AUTO</strong></span></div>
        <div class="setup-actions"><button class="button button--quiet" data-action="back" type="button">← Back</button><button class="button button--primary" data-action="launch" type="button"><span>Enter staging view</span><span aria-hidden="true">↗</span></button></div>
      </section>
    </main>
  `;
}

function placeholderMarkup(): string {
  return `
    <main class="setup-screen" data-testid="runtime-placeholder">
      <header class="topbar"><div class="brand-lockup"><span class="brand-lockup__sigil" aria-hidden="true">✦</span><span><strong>STARHAVEN</strong><small>BRIGHT FRONTIER</small></span></div><span class="build-pill">${BUILD_LABEL}</span></header>
      <section class="placeholder-card">
        <div class="placeholder-card__mark" aria-hidden="true">✦</div>
        <p class="eyebrow">STAGING COMPLETE</p>
        <h1>The frontier is warming.</h1>
        <p class="lede">The Three.js match runtime, fixed-step simulation, and touch command layer arrive in checkpoint 2.</p>
        <div class="placeholder-status"><span class="status-dot"></span><span>Title shell ready</span><span class="status-rule"></span><span>Runtime pending</span></div>
        <button class="button button--quiet" data-action="back" type="button">← Return to title</button>
      </section>
    </main>
  `;
}
