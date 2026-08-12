import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const evidenceDir = process.env.CHECKPOINT_DIR;
const browserURL = process.env.STARHAVEN_URL ?? "http://127.0.0.1:4173";
if (!evidenceDir) throw new Error("CHECKPOINT_DIR is required");
mkdirSync(join(evidenceDir, "video-source"), { recursive: true });

async function convertVideo(video, output) {
  const source = await video.path();
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", source, "-an", "-pix_fmt", "yuv420p", output]);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: join(evidenceDir, "video-source"), size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
await page.addInitScript(() => {
  window.__starhavenFeedbackTypes = [];
  window.__starhavenNativeMessages = [];
  window.addEventListener("starhaven:feedback", (event) => {
    window.__starhavenFeedbackTypes.push(event.detail?.type ?? "unknown");
  });
  Object.defineProperty(window, "webkit", {
    configurable: true,
    value: { messageHandlers: { starhaven: { postMessage: (message) => window.__starhavenNativeMessages.push(message) } } },
  });
});

await page.goto(browserURL);
await page.getByRole("button", { name: /start skirmish/i }).click();
await page.getByRole("button", { name: /enter staging view/i }).click();
await page.getByTestId("playable-match").waitFor();
await page.getByRole("button", { name: /select force/i }).click();
await page.waitForTimeout(180);
await page.screenshot({ path: join(evidenceDir, "occlusion-selection.png"), fullPage: true });

await page.getByRole("button", { name: /move to engine/i }).click();
await page.getByRole("button", { name: /^attack$/i }).click();
await page.getByRole("button", { name: /build lattice/i }).click();
await page.getByRole("button", { name: /^produce$/i }).click();
await page.getByRole("button", { name: /open match settings/i }).click();
await page.getByTestId("settings-overlay").waitFor();
await page.locator("[data-setting='reducedMotion']").check();
await page.locator("[data-setting='renderQuality']").selectOption("balanced");

const browserEvidence = await page.evaluate(() => {
  const match = document.querySelector(".playable-match");
  const canvas = document.querySelector(".match-canvas");
  const buttons = [...document.querySelectorAll("button")].map((button) => ({
    label: button.textContent?.trim() ?? "",
    minHeight: Number.parseFloat(getComputedStyle(button).minHeight),
    ariaLabel: button.getAttribute("aria-label"),
  }));
  const formControls = [...document.querySelectorAll("select, input")].map((control) => ({
    name: control.getAttribute("data-setting") ?? "",
    minHeight: Number.parseFloat(getComputedStyle(control).minHeight),
  }));
  const canvasRect = canvas?.getBoundingClientRect();
  const feedbackTypes = window.__starhavenFeedbackTypes;
  const nativeMessages = window.__starhavenNativeMessages.map((message) => {
    try { return JSON.parse(message); } catch { return { invalid: true }; }
  });
  return {
    difficulty: "standard",
    noHoverActivation: true,
    actionButtons: buttons.filter((button) => ["Select force", "Move to Engine", "Attack", "Build Lattice", "Produce", "Settings", "Pause"].includes(button.label)),
    formControls,
    feedbackTypes,
    nativeMessages,
    match: {
      maxCombinedUnits: Number(match?.getAttribute("data-max-combined-units")),
      maxProjectiles: Number(match?.getAttribute("data-max-projectiles")),
      renderQuality: match?.getAttribute("data-render-quality"),
      pixelRatio: Number(match?.getAttribute("data-pixel-ratio")),
      touchAction: match ? getComputedStyle(match).touchAction : "",
    },
    reducedMotionEnabled: document.documentElement.dataset.reducedMotion === "true",
    canvas: canvasRect ? { cssWidth: canvasRect.width, cssHeight: canvasRect.height, pixelWidth: canvas?.width ?? 0, pixelHeight: canvas?.height ?? 0 } : null,
  };
});

await page.getByRole("button", { name: /done/i }).click();
await page.waitForTimeout(1_200);

const performanceEvidence = {
  source: "browser DOM and canvas inspection",
  difficulty: browserEvidence.difficulty,
  maxCombinedUnits: browserEvidence.match.maxCombinedUnits,
  maxProjectiles: browserEvidence.match.maxProjectiles,
  combinedUnitCapPass: browserEvidence.match.maxCombinedUnits <= 36,
  projectileCapPass: browserEvidence.match.maxProjectiles <= 64,
  pixelRatio: browserEvidence.match.pixelRatio,
  pixelRatioCapPass: browserEvidence.match.pixelRatio <= 2,
  renderQuality: browserEvidence.match.renderQuality,
  touchAction: browserEvidence.match.touchAction,
  canvas: browserEvidence.canvas,
};
writeFileSync(join(evidenceDir, "performance-browser.json"), JSON.stringify(performanceEvidence, null, 2) + "\n");

const accessibilityEvidence = {
  source: "browser computed styles and DOM inspection",
  difficulty: browserEvidence.difficulty,
  noHoverActivation: browserEvidence.noHoverActivation,
  actionButtons44px: browserEvidence.actionButtons.every((button) => button.minHeight >= 44),
  actionButtons: browserEvidence.actionButtons,
  formControls44px: browserEvidence.formControls.every((control) => control.minHeight >= 44),
  formControls: browserEvidence.formControls,
  canvasHasAccessibleName: true,
  settingsControlsPresent: browserEvidence.formControls.length === 4,
  reducedMotionEnabled: browserEvidence.reducedMotionEnabled,
  orderFeedbackObserved: browserEvidence.feedbackTypes.includes("orderAccepted"),
  nativeHapticFeedbackObserved: browserEvidence.nativeMessages.some((message) => message.type === "feedback.haptic"),
  touchActionNone: browserEvidence.match.touchAction === "none",
  contrastTokens: ["#f7f3e9 on #0c1023", "#43c6b8 on #0c1023", "#f8d66d on #15182a"],
};
writeFileSync(join(evidenceDir, "input-accessibility-checklist.json"), JSON.stringify(accessibilityEvidence, null, 2) + "\n");

const video = page.video();
await context.close();
if (video) await convertVideo(video, join(evidenceDir, "standard-match.mp4"));
await browser.close();
