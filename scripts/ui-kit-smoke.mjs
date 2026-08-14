#!/usr/bin/env node
/** Headless Chrome CDP smoke: title → settings → skirmish; settings persist; music hidden. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CDP_PORT = 9340 + Math.floor(Math.random() * 200);
const HTTP_PORT = 8860 + Math.floor(Math.random() * 200);
const SAVE_KEY = "starhaven.bright-frontier.v1";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const filePath = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath.replace(/^\//, ""));
      if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath)) {
        res.writeHead(404); res.end("not found"); return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(HTTP_PORT, "127.0.0.1", () => resolve(server));
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  eval(expression) {
    return this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }).then((r) => {
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result?.value;
    });
  }
}

async function connectPage(port) {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      const page = targets.find((t) => t.type === "page" && t.url.includes(String(HTTP_PORT))) || targets.find((t) => t.type === "page");
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
        return new Cdp(ws);
      }
    } catch { /* retry */ }
    await sleep(150);
  }
  throw new Error("No CDP page target");
}

async function main() {
  let server; let cdp;
  const profile = path.join(os.tmpdir(), `ui-kit-smoke-${process.pid}`);
  const chrome = spawn(CHROME, [`--remote-debugging-port=${CDP_PORT}`, "--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${profile}`, `http://127.0.0.1:${HTTP_PORT}/`], { stdio: "ignore" });
  try {
    server = await startStaticServer();
    await sleep(400);
    cdp = await connectPage(CDP_PORT);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await cdp.send("ServiceWorker.disable");
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${HTTP_PORT}/` });
    await sleep(600);
    await cdp.eval(`new Promise((resolve)=>{const s=Date.now();const t=()=>{if(document.querySelector('.title-settings')&&document.querySelector('[data-kit-bound]'))resolve(true);else if(Date.now()-s>8000)resolve(false);else requestAnimationFrame(t);};t();})`);

    const results = {};
    results.titleVisible = await cdp.eval(`!!document.querySelector('#screen-title.active')`);
    await cdp.eval(`document.querySelector('.title-settings[data-action="settings"]').click()`);
    await sleep(250);
    results.settingsVisible = await cdp.eval(`!!document.querySelector('#screen-settings.active')`);
    results.noNativeSelect = await cdp.eval(`document.querySelectorAll('select:not(#native-pack-channel)').length === 0`);
    results.musicControl = await cdp.eval(`(()=>{const m=document.querySelector('[name="music"]');return !!m&&m.type==='range'&&!!m.closest('.ui-slider');})()`);
    results.kitDropdown = await cdp.eval(`!!document.querySelector('#settings-form .ui-dropdown')`);
    results.kitSlider = await cdp.eval(`!!document.querySelector('#settings-form .ui-slider')`);
    results.kitToggle = await cdp.eval(`!!document.querySelector('#settings-form .ui-toggle')`);

    await cdp.eval(`document.querySelector('#settings-form .ui-dropdown-option[data-value="high"]').click()`);
    await sleep(150);
    await cdp.eval(`document.querySelector('#settings-form .ui-toggle-btn[aria-label="Haptics"]').click()`);
    await sleep(150);

    const saved = await cdp.eval(`JSON.parse(localStorage.getItem('${SAVE_KEY}')||'{}')`);
    results.savedQuality = saved.settings?.quality === "high";
    results.savedHaptics = saved.settings?.haptics === false;
    results.savedMusic = typeof saved.settings?.music === "number";

    await cdp.send("Page.reload", { ignoreCache: true });
    await sleep(1000);
    await cdp.eval(`new Promise((resolve)=>{const s=Date.now();const t=()=>{if(document.querySelector('[data-kit-bound]'))resolve(true);else if(Date.now()-s>8000)resolve(false);else requestAnimationFrame(t);};t();})`);
    const afterReload = await cdp.eval(`JSON.parse(localStorage.getItem('${SAVE_KEY}')||'{}')`);
    results.persistQuality = afterReload.settings?.quality === "high";
    results.persistHaptics = afterReload.settings?.haptics === false;
    results.persistMusic = typeof afterReload.settings?.music === "number";

    await cdp.eval(`(()=>{const f=document.querySelector('#pause-settings-form');const q=f.querySelector('[name="quality"]');q.value='low';q.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await sleep(200);
    const pauseFormSaved = await cdp.eval(`JSON.parse(localStorage.getItem('${SAVE_KEY}')||'{}')`);
    results.pauseFormQualityPersists = pauseFormSaved.settings?.quality === "low";

    await cdp.eval(`document.querySelector('.ui-menu-btn[data-action="skirmish"]').click()`);
    await sleep(250);
    results.skirmishVisible = await cdp.eval(`!!document.querySelector('#screen-skirmish.active')`);
    results.skirmishDropdowns = await cdp.eval(`document.querySelectorAll('#screen-skirmish .ui-dropdown').length===2`);
    results.startBtnHeight = await cdp.eval(`(()=>{const b=document.querySelector('[data-action="start-skirmish"]');return b?parseFloat(getComputedStyle(b).minHeight)>=44:false;})()`);

    const failed = Object.entries(results).filter(([, v]) => !v);
    console.log(JSON.stringify({ ok: failed.length === 0, results, failed: failed.map(([k]) => k) }, null, 2));
    process.exit(failed.length ? 1 : 0);
  } finally {
    cdp?.ws.close();
    chrome.kill("SIGKILL");
    server?.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
