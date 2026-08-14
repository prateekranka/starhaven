/* Starhaven cache-first service worker. Serves warmed assets without re-buffering.
 * Never serve the SPA index.html for JSON/sprites — Pages 200-HTML fallback poisoned Brave. */
const MANIFEST_URL = "./cache-manifest.json";
const JSON_404 = { "Content-Type": "application/json", "Cache-Control": "no-store" };

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(precache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const manifest = await readManifest();
      const keep = cacheName(manifest.version);
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== keep && key.startsWith("starhaven-")).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(handleFetch(request, url));
});

async function handleFetch(request, url) {
  try {
    if (isHTML(request, url) || isLive(url) || isMapJson(url)) {
      return await networkFirst(request);
    }
    return await cacheFirst(request);
  } catch {
    return missingResponse(request, url);
  }
}

function cacheName(version) {
  return `starhaven-${version || "dev"}`;
}

function isHTML(request, url) {
  if (request.mode === "navigate") return true;
  const path = url.pathname;
  return path.endsWith(".html") || path.endsWith("/");
}

function isMapJson(url) {
  const path = url.pathname;
  return path.includes("/maps/") && path.endsWith(".json");
}

function isLive(url) {
  const path = url.pathname;
  if (path.endsWith("/cache-manifest.json") || path.endsWith("/sw.js")) return true;
  if (path.endsWith("/build-info.json") || path.endsWith("/dist-hashes.json")) return true;
  if (path.endsWith(".css")) return true;
  if (path.endsWith(".js") && !path.includes("/vendor/")) return true;
  if (path.endsWith(".json") && !path.includes("/vendor/")) return true;
  return false;
}

function isDocumentRequest(request, url) {
  return isHTML(request, url);
}

function looksLikeHtml(res) {
  if (!res) return false;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  return ct.includes("text/html");
}

function toKey(request) {
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  return url.href;
}

function missingResponse(request, url) {
  const path = (url || new URL(request.url)).pathname;
  if (path.endsWith(".json")) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: JSON_404 });
  }
  return new Response("", { status: 404, headers: { "Cache-Control": "no-store" } });
}

async function dropHtml(cache, key, res, request, url) {
  if (!res || !looksLikeHtml(res) || isDocumentRequest(request, url)) return res;
  if (cache && key) {
    try { await cache.delete(key); } catch { /* ignore */ }
  }
  return missingResponse(request, url);
}

async function readManifest() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-cache" });
    if (!res.ok || looksLikeHtml(res)) return { version: "dev", files: [] };
    return await res.json();
  } catch {
    return { version: "dev", files: [] };
  }
}

async function precache() {
  const manifest = await readManifest();
  const cache = await caches.open(cacheName(manifest.version));
  const files = Array.from(new Set([MANIFEST_URL, ...(manifest.shell || [])]));
  await mapPool(files, 8, (file) => putIfMissing(cache, new URL(file, self.registration.scope).href));
}

async function putIfMissing(cache, href) {
  const hit = await cache.match(href);
  if (hit && !looksLikeHtml(hit)) return;
  if (hit) {
    try { await cache.delete(href); } catch { /* ignore */ }
  }
  try {
    const res = await fetch(href);
    if (res.ok && !looksLikeHtml(res)) await cache.put(href, res);
  } catch {
    /* skip missing files so one 404 does not fail install */
  }
}

async function cacheFirst(request) {
  const url = new URL(request.url);
  const manifest = await readManifestCached();
  const cache = await caches.open(cacheName(manifest.version));
  const key = toKey(request);
  const hit = await cache.match(key, { ignoreSearch: true });
  if (hit) {
    const clean = await dropHtml(cache, key, hit, request, url);
    if (clean && clean.ok) return clean;
  }
  const res = await fetch(request);
  if (looksLikeHtml(res) && !isDocumentRequest(request, url)) {
    return missingResponse(request, url);
  }
  if (res.ok) await cache.put(key, res.clone()).catch(() => {});
  return res;
}

async function networkFirst(request) {
  const url = new URL(request.url);
  const manifest = await readManifestCached();
  const cache = await caches.open(cacheName(manifest.version));
  const key = toKey(request);
  try {
    const res = await fetch(request, { cache: "no-cache" });
    if (looksLikeHtml(res) && !isDocumentRequest(request, url)) {
      await cache.delete(key).catch(() => {});
      return missingResponse(request, url);
    }
    if (res.ok) await cache.put(key, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = await cache.match(key, { ignoreSearch: true });
    if (hit && !(looksLikeHtml(hit) && !isDocumentRequest(request, url))) return hit;
    throw err;
  }
}

let manifestMemo = null;
function readManifestCached() {
  if (!manifestMemo) manifestMemo = readManifest();
  return manifestMemo;
}

async function mapPool(items, limit, fn) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}
