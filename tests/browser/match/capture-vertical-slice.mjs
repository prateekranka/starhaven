import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const evidenceDir = process.env.CHECKPOINT_DIR;
const browserURL = process.env.STARHAVEN_URL ?? "http://127.0.0.1:4173";
if (!evidenceDir) throw new Error("CHECKPOINT_DIR is required");
mkdirSync(join(evidenceDir, "video-source"), { recursive: true });

async function enterMatch(page, url) {
  await page.goto(url);
  await page.getByRole("button", { name: /start skirmish/i }).click();
  await page.getByRole("button", { name: /enter staging view/i }).click();
  await page.getByTestId("playable-match").waitFor();
}

async function convertVideo(video, output) {
  const source = await video.path();
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", source, "-an", "-pix_fmt", "yuv420p", output]);
}

const browser = await chromium.launch({ headless: true });
const beforeContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const beforePage = await beforeContext.newPage();
await enterMatch(beforePage, browserURL);
await beforePage.waitForTimeout(220);
await beforePage.screenshot({ path: join(evidenceDir, "before-fracture.png"), fullPage: true });
await beforeContext.close();

const sliceContext = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: join(evidenceDir, "video-source"), size: { width: 1440, height: 900 } },
});
const slicePage = await sliceContext.newPage();
await enterMatch(slicePage, browserURL + "/?demo=vertical-slice");
await slicePage.locator("[data-match='events']").waitFor();
await slicePage.getByText(/fracture opened/i).waitFor({ timeout: 5_000 });
await slicePage.screenshot({ path: join(evidenceDir, "after-fracture.png"), fullPage: true });
await slicePage.getByTestId("results-screen").waitFor({ timeout: 10_000 });
const firstResult = {
  faction: await slicePage.locator("[data-result='faction']").textContent(),
  outcome: await slicePage.locator("[data-result='outcome']").textContent(),
  duration: await slicePage.locator("[data-result='duration']").textContent(),
  build: await slicePage.locator("[data-result='build']").textContent(),
  balance: await slicePage.locator("[data-result='balance']").textContent(),
  seed: await slicePage.locator("[data-result='seed']").textContent(),
  checksum: await slicePage.locator("[data-result='checksum']").textContent(),
};
const sliceVideo = slicePage.video();
await sliceContext.close();
if (sliceVideo) await convertVideo(sliceVideo, join(evidenceDir, "vertical-slice.mp4"));

const rematchContext = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: join(evidenceDir, "video-source"), size: { width: 1440, height: 900 } },
});
const rematchPage = await rematchContext.newPage();
await enterMatch(rematchPage, browserURL + "/?demo=vertical-slice");
await rematchPage.getByTestId("results-screen").waitFor({ timeout: 10_000 });
const firstSeed = await rematchPage.locator("[data-result='seed']").textContent();
await rematchPage.getByRole("button", { name: /rematch with new seed/i }).click();
await rematchPage.getByTestId("playable-match").waitFor();
await rematchPage.waitForFunction(() => document.querySelector("[data-hud='seed']")?.textContent !== "SEED —");
const rematchSeed = await rematchPage.locator("[data-hud='seed']").textContent();
await rematchPage.getByTestId("results-screen").waitFor({ timeout: 10_000 });
const rematchVideo = rematchPage.video();
await rematchContext.close();
if (rematchVideo) await convertVideo(rematchVideo, join(evidenceDir, "results-rematch.mp4"));

await browser.close();
writeFileSync(join(evidenceDir, "vertical-slice-observation.json"), JSON.stringify({ firstResult, firstSeed, rematchSeed, differentSeed: !rematchSeed.includes(firstSeed ?? "") }, null, 2) + "\n");
