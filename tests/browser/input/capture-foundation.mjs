import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const evidenceDir = process.env.CHECKPOINT_DIR;
if (!evidenceDir) throw new Error("CHECKPOINT_DIR is required");
mkdirSync(join(evidenceDir, "video-source"), { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: join(evidenceDir, "video-source"), size: { width: 1440, height: 900 } } });
const page = await context.newPage();
await page.goto("http://127.0.0.1:4173/?match=foundation");
await page.screenshot({ path: join(evidenceDir, "safe-area.png"), fullPage: true });
const box = await page.locator("canvas").boundingBox();
if (!box) throw new Error("match canvas has no layout box");
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 8);
await page.mouse.up();
await page.waitForTimeout(900);
const trace = await page.locator(".mode-chip").textContent();
const safeAreaText = await page.locator(".safe-area-debug").textContent();
const video = page.video();
await context.close();
await browser.close();
writeFileSync(join(evidenceDir, "gesture-state-trace.json"), `${JSON.stringify({ pointer: "single-pointer-drag", thresholdCssPx: 6, modeAfterDrag: trace, safeAreaDebug: safeAreaText }, null, 2)}\n`);
if (video) {
  const source = await video.path();
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", source, "-an", "-pix_fmt", "yuv420p", join(evidenceDir, "runtime-foundation.mp4")]);
}
