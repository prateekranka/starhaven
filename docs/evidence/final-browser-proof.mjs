import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const evidenceDir = process.env.CHECKPOINT_DIR;
const localURL = process.env.STARHAVEN_LOCAL_URL ?? "http://127.0.0.1:4173";
const hostedURL = process.env.STARHAVEN_HOSTED_URL ?? "https://prateekranka.github.io/starhaven-bright-frontier/";
if (!evidenceDir) throw new Error("CHECKPOINT_DIR is required");
mkdirSync(join(evidenceDir, "video-source"), { recursive: true });

const errors = [];
const requests = [];
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: join(evidenceDir, "video-source"), size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => requests.push({ url: request.url(), method: request.method(), resourceType: request.resourceType() }));

async function buildInfo() {
  return page.evaluate(async () => {
    const response = await fetch(new URL("build-info.json", location.href), { cache: "no-store" });
    return { status: response.status, body: await response.json() };
  });
}

async function enterDemo(url, seed) {
  await page.goto(`${url}?demo=vertical-slice&proof=${seed}`, { waitUntil: "networkidle" });
  await page.getByTestId("title-screen").waitFor();
  await page.getByRole("button", { name: /start skirmish/i }).click();
  await page.getByTestId("setup-screen").waitFor();
  await page.locator("[data-setup='difficulty']").selectOption("standard");
  await page.locator("[data-setup='seed']").fill(String(seed));
  await page.getByRole("button", { name: /enter staging view/i }).click();
  await page.getByTestId("playable-match").waitFor();
}

async function exerciseLocalControls() {
  await page.getByRole("button", { name: /select force/i }).click();
  const canvas = page.locator(".match-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("match canvas has no bounds");
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55, { steps: 4 });
  await page.mouse.up();
  await page.getByTestId("playable-match").locator("[data-hud='cancel']").evaluate((button) => button.click());
  await page.getByRole("button", { name: /move to engine/i }).click();
  await page.getByRole("button", { name: /^attack$/i }).click();
  await page.getByRole("button", { name: /build lattice/i }).click();
  await page.getByRole("button", { name: /^produce$/i }).click();
  await page.getByRole("button", { name: /open match settings/i }).click();
  await page.getByTestId("settings-overlay").waitFor();
  await page.locator("[data-setting='reducedMotion']").check();
  await page.locator("[data-setting='renderQuality']").selectOption("balanced");
  await page.getByRole("button", { name: /done/i }).click();
  await page.getByRole("button", { name: /^pause$/i }).click();
  await page.getByTestId("pause-overlay").waitFor();
  await page.getByRole("button", { name: /resume match/i }).click();
}

async function readResult() {
  await page.getByTestId("results-screen").waitFor({ timeout: 10_000 });
  return page.evaluate(() => Object.fromEntries(["faction", "outcome", "duration", "build", "balance", "seed", "checksum"].map((key) => [key, document.querySelector(`[data-result='${key}']`)?.textContent ?? ""])));
}

async function runTwoMatches(url, firstSeed, screenshotName, controls = false) {
  await enterDemo(url, firstSeed);
  const info = await buildInfo();
  if (controls) await exerciseLocalControls();
  const first = await readResult();
  await page.screenshot({ path: join(evidenceDir, screenshotName), fullPage: true });
  await page.getByRole("button", { name: /rematch with new seed/i }).click();
  await page.getByTestId("playable-match").waitFor();
  const rematch = await readResult();
  return { buildInfo: info, first, rematch, differentSeed: first.seed !== rematch.seed };
}

const local = await runTwoMatches(localURL, 123456789, "local-final-results.png", true);
const hosted = await runTwoMatches(hostedURL.replace(/\/$/, ""), 987654321, "hosted-final-results.png");
const pageOrigin = new URL(page.url()).origin;
const crossOriginRequests = requests.filter((request) => {
  try { return new URL(request.url()).origin !== pageOrigin && request.resourceType !== "document"; } catch { return false; }
});

const video = page.video();
await context.close();
if (video) execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", await video.path(), "-an", "-pix_fmt", "yuv420p", join(evidenceDir, "final-browser.mp4")]);
await browser.close();

writeFileSync(join(evidenceDir, "final-browser-observation.json"), JSON.stringify({
  schema: 1,
  oneBrowser: true,
  onePage: true,
  headless: false,
  local: { url: localURL, ...local },
  hosted: { url: hostedURL, ...hosted },
  crossOriginRequests,
  pageErrors: errors,
  valid: local.differentSeed && hosted.differentSeed && errors.length === 0 && crossOriginRequests.length === 0,
}, null, 2) + "\n");
