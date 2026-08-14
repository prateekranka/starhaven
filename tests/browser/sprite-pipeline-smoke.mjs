#!/usr/bin/env node
/** Headless Chrome CDP smoke for sun-guard pipeline atlas + cache manifest. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "../..");
const port = 8791 + (process.pid % 200);
const base = `http://127.0.0.1:${port}`;

const atlasJson = JSON.parse(readFileSync(resolve(root, "media/sprites/sun-guard.atlas.json"), "utf8"));
const atlasSha = createHash("sha256").update(readFileSync(resolve(root, "media/sprites/sun-guard.atlas.png"))).digest("hex");

const server = createServer((req, res) => {
  const path = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const file = resolve(root, path.replace(/^\//, ""));
  try {
    const data = readFileSync(file);
    const type = path.endsWith(".js") ? "text/javascript" : path.endsWith(".json") ? "application/json" : path.endsWith(".png") ? "image/png" : "text/html";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("missing");
  }
});

await new Promise((r) => server.listen(port, "127.0.0.1", r));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
await page.goto(`${base}/index.html`, { waitUntil: "domcontentloaded" });
const result = await page.evaluate(async ({ baseUrl, expectedSha }) => {
  const atlas = await (await fetch(`${baseUrl}/media/sprites/sun-guard.atlas.json`)).json();
  const pngBuf = new Uint8Array(await (await fetch(`${baseUrl}/media/sprites/sun-guard.atlas.png`)).arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", pngBuf);
  const sha = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const manifest = await (await fetch(`${baseUrl}/cache-manifest.json`)).json();
  return {
    atlasId: atlas.id,
    frameCount: atlas.frames?.length ?? 0,
    clipIds: (atlas.clips || []).map((c) => c.id),
    shaMatch: sha === expectedSha,
    cacheListed: manifest.match.includes("media/sprites/sun-guard.atlas.png"),
  };
}, { baseUrl: base, expectedSha: atlasSha });

await browser.close();
server.close();

const ok = result.atlasId === "sun-guard" && result.frameCount === 96 && result.shaMatch && result.cacheListed && atlasJson.sha256 === atlasSha;
console.log(JSON.stringify({ ok, ...result, atlasSha }, null, 2));
process.exitCode = ok ? 0 : 1;
