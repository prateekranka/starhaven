import type { Faction } from "../../game/content/schema";
import type { SkirmishDifficulty } from "../../game/sim/match";

export interface SetupValues {
  faction: Faction;
  difficulty: SkirmishDifficulty;
  seed: number;
}

export function setupMarkup(): string {
  return `
    <main class="setup-screen" data-testid="setup-screen">
      <header class="topbar"><div class="brand-lockup"><span class="brand-lockup__sigil" aria-hidden="true">✦</span><span><strong>STARHAVEN</strong><small>BRIGHT FRONTIER</small></span></div><span class="build-pill">MATCH SETUP</span></header>
      <section class="setup-panel">
        <p class="eyebrow">SKIRMISH / FIRST LIGHT</p>
        <h1>Choose your opening.</h1>
        <p class="lede">Select a faction, set the difficulty, and enter the Meridian Breach.</p>
        <div class="setup-grid" role="group" aria-label="Faction">
          <button class="setup-choice setup-choice--active" data-faction="sunwoven" type="button"><span class="setup-choice__icon">✦</span><span><strong>Sunwoven</strong><small>Agile frontier builders</small></span><span class="setup-choice__check">✓</span></button>
          <button class="setup-choice" data-faction="gravemark" type="button"><span class="setup-choice__icon setup-choice__icon--dark">◇</span><span><strong>Gravemark</strong><small>Fortified breach keepers</small></span><span class="setup-choice__check" aria-hidden="true"></span></button>
        </div>
        <div class="setup-options">
          <label><span>Difficulty</span><select data-setup="difficulty"><option value="explorer">Explorer</option><option value="standard" selected>Standard</option><option value="vanguard">Vanguard</option></select></label>
          <label><span>Seed</span><input data-setup="seed" inputmode="numeric" placeholder="AUTO" aria-describedby="seed-help" /></label>
        </div>
        <p class="setup-help" id="seed-help">Use a decimal or hexadecimal 32-bit seed. Leave it empty for a secure random seed.</p>
        <p class="setup-error" data-setup="error" role="alert" hidden></p>
        <div class="setup-meta"><span><small>MAP</small><strong>MERIDIAN BREACH / 48 × 32</strong></span><span><small>SIMULATION</small><strong>20 HZ / 50 MS</strong></span><span><small>STARTING FLUX</small><strong>260 FLUX</strong></span></div>
        <div class="setup-actions"><button class="button button--quiet" data-action="back" type="button">← Back</button><button class="button button--primary" data-action="launch" type="button"><span>Enter staging view</span><span aria-hidden="true">↗</span></button></div>
      </section>
    </main>
  `;
}

export function readSetupValues(root: HTMLElement, randomSeed: () => number): SetupValues | { error: string } {
  const faction = root.querySelector<HTMLElement>("[data-faction].setup-choice--active")?.dataset.faction;
  const difficulty = root.querySelector<HTMLSelectElement>("[data-setup='difficulty']")?.value;
  const seedInput = root.querySelector<HTMLInputElement>("[data-setup='seed']")?.value.trim() ?? "";
  const parsedFaction: Faction = faction === "gravemark" ? "gravemark" : "sunwoven";
  const parsedDifficulty: SkirmishDifficulty = difficulty === "explorer" || difficulty === "vanguard" ? difficulty : "standard";
  if (seedInput.length === 0) return { faction: parsedFaction, difficulty: parsedDifficulty, seed: randomSeed() };
  const radix = /^0x/i.test(seedInput) ? 16 : 10;
  const digits = radix === 16 ? seedInput.slice(2) : seedInput;
  if (!/^[0-9a-f]+$/i.test(digits)) return { error: "Seed must contain only 32-bit decimal or hexadecimal digits." };
  const seed = Number.parseInt(digits, radix);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) return { error: "Seed must be between 0 and 4,294,967,295." };
  return { faction: parsedFaction, difficulty: parsedDifficulty, seed: seed >>> 0 };
}
