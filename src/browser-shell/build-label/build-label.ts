declare const __STARHAVEN_DISPLAY_SHA__: string;

export const BUILD_LABEL = __STARHAVEN_DISPLAY_SHA__;

export function installBuildLabels(): void {
  if (typeof document === "undefined") return;
  const app = document.getElementById("app");
  if (!app) return;

  let applying = false;
  const apply = (): void => {
    if (applying) return;
    applying = true;
    try {
      app.querySelectorAll<HTMLElement>(".title-screen .build-pill").forEach((element) => {
        setText(element, `BUILD ${BUILD_LABEL}`);
      });
      app.querySelectorAll<HTMLElement>(".title-footer span").forEach((element) => {
        if (element.textContent?.startsWith("BUILD ")) setText(element, `BUILD ${BUILD_LABEL}`);
      });
      app.querySelectorAll<HTMLElement>("[data-result='build']").forEach((element) => {
        setText(element, BUILD_LABEL);
      });
      app.querySelectorAll<HTMLElement>(".match-runtime-label").forEach((element) => {
        setText(element, `BUILD ${BUILD_LABEL} / MATCH RUNTIME / 20 HZ`);
      });
      app.querySelectorAll<HTMLElement>(".pause-card").forEach((card) => {
        let label = card.querySelector<HTMLElement>("[data-build-label]");
        if (!label) {
          label = document.createElement("p");
          label.dataset.buildLabel = "true";
          label.className = "build-label";
          card.appendChild(label);
        }
        setText(label, `BUILD ${BUILD_LABEL}`);
      });
      app.querySelectorAll<HTMLElement>(".match-hud").forEach((hud) => {
        let label = hud.querySelector<HTMLElement>("[data-build-label]");
        if (!label) {
          label = document.createElement("div");
          label.dataset.buildLabel = "true";
          label.className = "match-hud__build build-label";
          hud.appendChild(label);
        }
        setText(label, `BUILD ${BUILD_LABEL}`);
      });
    } finally {
      applying = false;
    }
  };

  apply();
  new MutationObserver(apply).observe(app, { childList: true, subtree: true });
}

function setText(element: HTMLElement, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}
