#!/usr/bin/env node
/**
 * Capture WebGL canvas stills for the painted-civ look bar.
 * Requires: npx playwright, and a static pack server (or --url).
 *
 *   python3 -m http.server 8765
 *   node scripts/capture-skirmish-stills.mjs --url http://127.0.0.1:8765/
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const urlBase = process.env.STARHAVEN_URL || process.argv.find((a) => a.startsWith("--url="))?.slice(6) || "http://127.0.0.1:8765";
const outDir = process.env.LOOK_OUT || join(repoRoot, "docs/evidence/skirmish-bar/stills");
const seed = process.env.LOOK_SEED || "0x4d455249";
const matches = [
  { id: "cog-ash", p: "cogforged", e: "ashvein", townLook: "player-tc" },
  { id: "cog-storm", p: "stormveil", e: "cogforged", townLook: "player-tc" },
  { id: "ash-storm", p: "ashvein", e: "stormveil", townLook: "player-tc" },
];

function playUrl(p, e) {
  const u = new URL(urlBase.endsWith("/") ? urlBase : `${urlBase}/`);
  u.searchParams.set("play", "1");
  u.searchParams.set("qa", "1");
  u.searchParams.set("aivsai", "1");
  u.searchParams.set("map", "highland-chokes");
  u.searchParams.set("faction", p);
  u.searchParams.set("enemy", e);
  u.searchParams.set("seed", seed);
  u.searchParams.set("diff", "chieftain");
  return u.toString();
}

async function waitForMatch(page) {
  await page.waitForFunction(() => Boolean(window.__starhavenLook), null, { timeout: 60_000 });
  await page.waitForFunction(() => {
    const s = window.__starhavenLook?.();
    return s?.ok && s.player?.tc && s.enemy?.tc;
  }, null, { timeout: 30_000 });
}

async function fastForwardTo(page, pred, { speed = 12, timeoutMs = 180_000 } = {}) {
  await page.evaluate((s) => window.__starhavenLook({ speed: s }), speed);
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const state = await page.evaluate(() => window.__starhavenLook());
    if (pred(state)) return state;
    if (state?.winner) return state;
    await page.waitForTimeout(250);
  }
  return page.evaluate(() => window.__starhavenLook());
}

async function captureNamed(page, look, file) {
  await page.evaluate((kind) => window.__starhavenLook({ look: kind, speed: 1 }), look);
  await page.waitForTimeout(400);
  const dataUrl = await page.evaluate(() => window.__starhavenCaptureCanvas());
  if (!dataUrl) throw new Error(`canvas capture failed for ${file}`);
  const buf = Buffer.from(dataUrl.split(",")[1], "base64");
  writeFileSync(file, buf);
  return buf.length;
}

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(60_000);
const log = [];

try {
  for (const m of matches) {
    const url = playUrl(m.p, m.e);
    await page.goto(url, { waitUntil: "networkidle" });
    await waitForMatch(page);
    const townState = await fastForwardTo(page, (s) => s.sec >= 80 && (s.player?.buildings || 0) >= 2);
    const townPath = join(outDir, `${m.id}-town.png`);
    await captureNamed(page, m.townLook || "player-tc", townPath);
    const fightState = await fastForwardTo(
      page,
      (s) => {
        if (!(s.player?.military > 0 && s.enemy?.military > 0)) return false;
        if (s.fightDist == null || s.fightDist < 7 || s.fightDist > 11) return false;
        if (s.fightX == null || s.fightZ == null) return false;
        return s.fightX > 28 && s.fightX < 164 && s.fightZ > 28 && s.fightZ < 164;
      },
      { speed: 12, timeoutMs: 360_000 },
    );
    const fightPath = join(outDir, `${m.id}-fight.png`);
    await captureNamed(page, "choke", fightPath);
    log.push({
      id: m.id,
      player: m.p,
      enemy: m.e,
      url,
      town: { file: townPath, ...townState },
      fight: { file: fightPath, ...fightState },
    });
    console.error(`captured ${m.id} town@${townState.sec | 0}s fight@${fightState.sec | 0}s`);
  }
} finally {
  await browser.close();
}

writeFileSync(join(outDir, "captures.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), seed, log }, null, 2)}\n`);
console.log(JSON.stringify({ outDir, n: log.length }, null, 2));
