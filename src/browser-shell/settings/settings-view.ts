import type { FeedbackController, FeedbackSettings } from "../../feedback/feedback";

export interface SettingsViewHandle {
  dispose(): void;
}

export function mountSettingsView(parent: HTMLElement, feedback: FeedbackController, onClose: () => void, onChange?: (settings: FeedbackSettings) => void): SettingsViewHandle {
  const settings = feedback.settings();
  const root = document.createElement("section");
  root.className = "settings-overlay";
  root.dataset.testid = "settings-overlay";
  root.innerHTML = [
    '<div class="settings-card" role="dialog" aria-modal="true" aria-labelledby="settings-title">',
    '<div class="settings-card__heading"><div><p class="eyebrow">MATCH SETTINGS</p><h2 id="settings-title">Make it yours.</h2></div><button class="settings-close" data-action="close-settings" type="button" aria-label="Close settings">×</button></div>',
    '<label class="settings-toggle"><span><strong>Sound cues</strong><small>Local order, fracture, and results feedback.</small></span><input data-setting="audioEnabled" type="checkbox"' + (settings.audioEnabled ? " checked" : "") + ' /></label>',
    '<label class="settings-toggle"><span><strong>Haptics</strong><small>Native bridge and device vibration feedback when supported.</small></span><input data-setting="hapticsEnabled" type="checkbox"' + (settings.hapticsEnabled ? " checked" : "") + ' /></label>',
    '<label class="settings-toggle"><span><strong>Reduce motion</strong><small>Remove decorative motion while keeping simulation timing.</small></span><input data-setting="reducedMotion" type="checkbox"' + (settings.reducedMotion ? " checked" : "") + ' /></label>',
    '<label class="settings-select"><span><strong>Render quality</strong><small>Balanced reduces device-pixel work.</small></span><select data-setting="renderQuality"><option value="high"' + (settings.renderQuality === "high" ? " selected" : "") + '>High</option><option value="balanced"' + (settings.renderQuality === "balanced" ? " selected" : "") + '>Balanced</option></select></label>',
    '<button class="button button--primary settings-done" data-action="close-settings" type="button">Done</button></div>',
  ].join("");
  parent.appendChild(root);
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-setting]").forEach((control) => {
    control.addEventListener("change", () => {
      const next = readSettings(root);
      feedback.setSettings(next);
      onChange?.(next);
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-action='close-settings']").forEach((button) => button.addEventListener("click", onClose));
  root.querySelector<HTMLInputElement>("[data-setting='audioEnabled']")?.focus();
  return { dispose: () => root.remove() };
}

function readSettings(root: HTMLElement): FeedbackSettings {
  const checked = (name: string): boolean => root.querySelector<HTMLInputElement>("[data-setting='" + name + "']")?.checked ?? false;
  const quality = root.querySelector<HTMLSelectElement>("[data-setting='renderQuality']")?.value;
  return {
    audioEnabled: checked("audioEnabled"),
    hapticsEnabled: checked("hapticsEnabled"),
    reducedMotion: checked("reducedMotion"),
    renderQuality: quality === "balanced" ? "balanced" : "high",
  };
}
