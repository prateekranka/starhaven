import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const evidenceDir = process.env.CHECKPOINT_DIR;
if (!evidenceDir) throw new Error("CHECKPOINT_DIR is required");

mkdirSync(join(evidenceDir, "video-source"), { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: join(evidenceDir, "video-source"), size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
const requests = [];
page.on("request", (request) => requests.push({ url: request.url(), method: request.method(), resourceType: request.resourceType() }));
await page.goto("http://127.0.0.1:4173/");
await page.screenshot({ path: join(evidenceDir, "title-local.png"), fullPage: true });
await page.waitForTimeout(1800);
const video = page.video();
await context.close();
await browser.close();

writeFileSync(join(evidenceDir, "network-requests.json"), `${JSON.stringify({
  requests,
  sameOrigin: requests.every((entry) => new URL(entry.url).origin === "http://127.0.0.1:4173"),
  count: requests.length,
}, null, 2)}\n`);

if (video) {
  const source = await video.path();
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", source, "-an", "-pix_fmt", "yuv420p", join(evidenceDir, "title-motion.mp4")]);
}
