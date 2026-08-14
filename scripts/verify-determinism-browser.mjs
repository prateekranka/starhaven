#!/usr/bin/env node
/** Browser check: same seed URL → identical map fingerprint (two loads). */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const seed = process.env.SIM_SEED || "0x4d455249";
const port = Number(process.env.PORT || 8765);

const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  const path = req.url?.split("?")[0] || "/";
  const file = join(root, path === "/" ? "index.html" : path.replace(/^\//, ""));
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

await new Promise((resolve) => server.listen(port, resolve));
const url = `http://127.0.0.1:${port}/?play=1&seed=${encodeURIComponent(seed)}&qa=1`;

async function readFingerprint(page) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__starhavenState?.mapFingerprint, null, { timeout: 60_000 });
  return page.evaluate(() => window.__starhavenState.mapFingerprint);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const a = await readFingerprint(page);
const b = await readFingerprint(page);
await browser.close();
server.close();

const ok = a === b;
console.log(JSON.stringify({ seed, mapFingerprintA: a, mapFingerprintB: b, equal: ok }, null, 2));
process.exit(ok ? 0 : 1);
