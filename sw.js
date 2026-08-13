/* Starhaven cache-first service worker. Serves warmed assets without re-buffering. */
const MANIFEST_URL = "./cache-manifest.json";

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

  if (isHTML(request, url) || isLive(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

function cacheName(version) {
  return `starhaven-${version || "dev"}`;
}

function isHTML(request, url) {
  if (request.mode === "navigate") return true;
  const path = url.pathname;
  return path.endsWith(".html") || path.endsWith("/");
}

function isLive(url) {
  const path = url.pathname;
  if (path.endsWith("/cache-manifest.json") || path.endsWith("/sw.js")) return true;
  if (path.endsWith(".css")) return true;
  if (path.endsWith(".js") && !path.includes("/vendor/")) return true;
  return false;
}

function toKey(request) {
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  return url.href;
}

async function readManifest() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-cache" });
    if (!res.ok) return { version: "dev", files: [] };
    return res.json();
  } catch {
    return { version: "dev", files: [] };
  }
}

async function precache() {
  const manifest = await readManifest();
  const cache = await caches.open(cacheName(manifest.version));
  const files = Array.from(new Set([MANIFEST_URL, ...(manifest.files || []), ...(manifest.match || []), ...(manifest.shell || [])]));
  await mapPool(files, 8, (file) => putIfMissing(cache, new URL(file, self.registration.scope).href));
}

async function putIfMissing(cache, href) {
  const hit = await cache.match(href);
  if (hit) return;
  try {
    const res = await fetch(href, { cache: "reload" });
    if (res.ok) await cache.put(href, res);
  } catch {
    /* skip missing files so one 404 does not fail install */
  }
}

async function cacheFirst(request) {
  const manifest = await readManifestCached();
  const cache = await caches.open(cacheName(manifest.version));
  const key = toKey(request);
  const hit = await cache.match(key, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(key, res.clone());
  return res;
}

async function networkFirst(request) {
  const manifest = await readManifestCached();
  const cache = await caches.open(cacheName(manifest.version));
  const key = toKey(request);
  try {
    const res = await fetch(request, { cache: "no-cache" });
    if (res.ok) await cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key, { ignoreSearch: true });
    if (hit) return hit;
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
