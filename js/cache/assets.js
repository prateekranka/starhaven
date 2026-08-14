const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

const images = new Map();
const complete = new Set();
const inflight = new Map();

let manifestPromise = null;
let warmPromise = null;
let matchPromise = null;
let matchReady = false;

const MATCH_FALLBACK = [
  "media/textures/pixel-mesa.png",
  "media/textures/pixel-water.png",
  "media/sprites/sheet-sunwoven-walk.png",
  "media/sprites/sheet-gravemark-walk.png",
  "media/sprites/sheet-sun-guard.png",
  "media/sprites/sun-guard.atlas.png",
  "media/sprites/sun-guard.atlas.json",
  "media/sprites/sheet-grave-guard.png",
  "media/sprites/unit-sun-strider.png",
  "media/sprites/unit-grave-strider.png",
  "media/sprites/unit-sun-siege.png",
  "media/sprites/unit-grave-siege.png",
  "media/sprites/bldg-sun-tc.png",
  "media/sprites/bldg-sun-house.png",
  "media/sprites/bldg-sun-rax.png",
  "media/sprites/bldg-sun-mill.png",
  "media/sprites/bldg-sun-wonder.png",
  "media/sprites/bldg-grave-tc.png",
  "media/sprites/bldg-grave-house.png",
  "media/sprites/bldg-grave-rax.png",
  "media/sprites/bldg-grave-mill.png",
  "media/sprites/bldg-grave-wonder.png",
  "media/sprites/node-food.png",
  "media/sprites/node-trees.png",
  "media/sprites/node-crystal.png",
  "media/sprites/node-ore.png",
  "media/sprites/node-void.png",
  "vendor/three.module.js",
  "js/game/main.js",
  "js/game/render.js",
  "js/sim/engine.js",
  "js/sim/path.js",
  "js/sim/ai.js",
  "js/data/catalog.js",
];

export function cachedImage(url) {
  return images.get(normalize(url)) || null;
}

export function matchAssetsReady() {
  return matchReady;
}

export function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch("cache-manifest.json", { cache: "no-cache" })
      .then((res) => {
        if (!res.ok) throw new Error("cache-manifest.json missing");
        return res.json();
      })
      .catch(() => ({ version: "dev", shell: [], match: [], files: [] }));
  }
  return manifestPromise;
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  const host = location.hostname;
  const ok =
    location.protocol === "https:" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]";
  if (!ok) return Promise.resolve(null);
  return navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => null);
}

export function startBackgroundWarm(onProgress) {
  if (!warmPromise) {
    warmPromise = (async () => {
      registerServiceWorker();
      const manifest = await loadManifest();
      const ordered = unique([...(manifest.shell || []), ...(manifest.match || []), ...(manifest.files || [])]);
      await warmFiles(ordered, onProgress, manifest);
    })();
  }
  return warmPromise;
}

export function ensureMatchAssets(onProgress) {
  if (!matchPromise) {
    matchPromise = (async () => {
      registerServiceWorker();
      const manifest = await loadManifest();
      const urls = unique(manifest.match?.length ? manifest.match : MATCH_FALLBACK);
      await warmFiles(urls, onProgress, manifest, { decodeImages: true });
      matchReady = true;
    })();
  }
  return matchPromise;
}

function normalize(url) {
  return String(url || "").replace(/^\.\//, "");
}

function unique(list) {
  return Array.from(new Set(list.map(normalize).filter(Boolean)));
}

function cacheName(version) {
  return `starhaven-${version || "dev"}`;
}

function isImage(url) {
  return IMAGE_EXT.test(url);
}

async function openCache(manifest) {
  if (!self.caches) return null;
  try {
    return await caches.open(cacheName(manifest.version));
  } catch {
    return null;
  }
}

async function warmFiles(urls, onProgress, manifest, { decodeImages = false } = {}) {
  const cache = await openCache(manifest);
  const matchSet = new Set((manifest.match || MATCH_FALLBACK).map(normalize));
  let done = 0;
  const total = urls.length;
  await mapPool(urls, 6, async (url) => {
    const key = normalize(url);
    try {
      await warmOne(key, cache, decodeImages || (isImage(key) && matchSet.has(key)));
    } catch (err) {
      if (decodeImages) throw err;
      console.warn("cache skip", url, err);
    }
    done += 1;
    onProgress?.(done, total, url);
  });
}

function warmOne(url, cache, decode) {
  const key = normalize(url);
  if (complete.has(key) && (!decode || images.has(key) || !isImage(key))) {
    return Promise.resolve();
  }
  const existing = inflight.get(key);
  if (existing) return existing;

  const work = (async () => {
    const blob = await loadBlob(key, cache);
    if (decode && isImage(key) && !images.has(key) && blob) {
      const img = new Image();
      img.decoding = "async";
      img.src = URL.createObjectURL(blob);
      images.set(key, img);
      const ready = img.decode
        ? img.decode()
        : new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });
      await Promise.race([ready.catch(() => {}), sleep(1500)]);
    }
    complete.add(key);
    inflight.delete(key);
  })().catch((err) => {
    inflight.delete(key);
    throw err;
  });

  inflight.set(key, work);
  return work;
}

function hrefOf(url) {
  return new URL(normalize(url), location.href).href;
}

async function loadBlob(url, cache) {
  const href = hrefOf(url);
  if (cache) {
    const hit = await cache.match(href, { ignoreSearch: true });
    if (hit) return hit.blob();
  }
  const res = await fetch(href);
  if (!res.ok) throw new Error(`Failed to cache ${url} (${res.status})`);
  if (cache) {
    cache.put(href, res.clone()).catch(() => {});
  }
  return res.blob();
}

async function mapPool(items, limit, fn) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, () => worker()));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
