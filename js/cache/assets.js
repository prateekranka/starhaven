import { audio } from "../audio/engine.js";

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
const PLAYABLE_CIVS = ["sunwoven", "gravemark", "cogforged", "ashvein", "stormveil"];
const CIV_PREFIX = {
  sunwoven: "sun",
  gravemark: "grave",
  stormveil: "storm",
  ashvein: "ash",
  cogforged: "cog",
};

const images = new Map();
const complete = new Set();
const inflight = new Map();

let manifestPromise = null;
let warmPromise = null;
let matchReady = false;
let criticalDepth = 0;
const criticalWaiters = [];

const CORE_MATCH = [
  "maps/manifest.json",
  "media/textures/pixel-mesa.png",
  "media/textures/pixel-water.png",
  "media/sprites/node-food.png",
  "media/sprites/node-trees.png",
  "media/sprites/node-crystal.png",
  "media/sprites/node-ore.png",
  "media/sprites/node-void.png",
  "media/sprites/icon-move.png",
  "media/sprites/icon-hold.png",
];

const MATCH_FALLBACK = [
  ...CORE_MATCH,
  "maps/bright-mesa.json",
  "maps/training-flat.json",
  ...PLAYABLE_CIVS.flatMap((id) => civSpriteUrls(id)),
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
        if (!res.ok || isHtmlResponse(res)) throw new Error("cache-manifest.json missing");
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
      const shell = unique(manifest.shell || []);
      await warmFiles(shell, onProgress, manifest, { concurrency: 8, yieldToCritical: true });
      const rest = unique([...(manifest.match || []), ...(manifest.files || []), ...MATCH_FALLBACK])
        .filter((url) => !shell.includes(url));
      await warmFiles(rest, onProgress, manifest, { concurrency: 4, yieldToCritical: true });
      await audio.preload().catch((err) => console.warn("audio preload", err));
    })().catch((err) => {
      warmPromise = null;
      throw err;
    });
  }
  return warmPromise;
}

export async function ensureMatchAssets(onProgress, opts = {}) {
  if (onProgress && typeof onProgress === "object") {
    opts = onProgress;
    onProgress = opts.onProgress;
  }
  registerServiceWorker();
  beginCritical();
  try {
    const manifest = await loadManifest();
    const urls = await matchCriticalUrls(opts, manifest);
    await warmFiles(urls, onProgress, manifest, { decodeImages: true, concurrency: 12, required: false });
    matchReady = true;
    void startBackgroundWarm();
    void audio.preload().catch(() => {});
  } finally {
    endCritical();
  }
}

function opponentOf(civId) {
  return PLAYABLE_CIVS.find((id) => id !== civId) || "gravemark";
}

function civSpriteUrls(civId) {
  const p = CIV_PREFIX[civId] || "sun";
  const kinds = ["walk", "guard", "strider", "siege"];
  if (p === "storm") kinds.push("wagon");
  const urls = [];
  for (const kind of kinds) {
    urls.push(`media/sprites/${p}-${kind}.atlas.png`, `media/sprites/${p}-${kind}.atlas.json`);
  }
  for (const b of ["tc", "house", "rax", "mill", "lumber", "mine", "spire", "den", "workshop", "wonder"]) {
    urls.push(`media/sprites/bldg-${p}-${b}.png`);
  }
  const trains = ["villager", "scout", "guard", "archer", "strider", "siege"];
  if (p === "storm") trains.push("wagon");
  for (const unit of trains) {
    urls.push(`media/sprites/icon-train-${p}-${unit}.png`);
    urls.push(`media/sprites/portrait-${p}-${unit}.png`);
  }
  urls.push(`media/sprites/icon-age-${p}.png`);
  if (p === "ash") {
    urls.push("media/sprites/bldg-ash-tunnel-mouth.png", "media/sprites/bldg-ash-lava-vent.png");
  }
  if (p === "cog") urls.push("media/sprites/bldg-cog-grid-pylon.png");
  if (p === "storm") {
    urls.push("media/sprites/bldg-storm-wagon.png", "media/sprites/unit-storm-wagon.png");
  }
  return urls;
}

async function matchCriticalUrls(opts, manifest) {
  const playerFaction = opts.playerFaction || "sunwoven";
  const enemyFaction = opts.enemyFaction || opponentOf(playerFaction);
  const mapId = opts.mapId || "bright-mesa";
  const urls = [...CORE_MATCH, ...civSpriteUrls(playerFaction), ...civSpriteUrls(enemyFaction)];
  try {
    const mapManifest = await readJson("maps/manifest.json");
    urls.push("maps/manifest.json");
    const entry = mapManifest.maps?.find((m) => m.id === mapId) || mapManifest.maps?.find((m) => m.default);
    if (entry?.file) urls.push(entry.file);
  } catch {
    urls.push("maps/manifest.json", "maps/bright-mesa.json", "maps/training-flat.json");
  }
  const known = new Set(unique([...(manifest.match || []), ...(manifest.files || []), ...MATCH_FALLBACK]));
  return unique(urls).filter((url) => !IMAGE_EXT.test(url) || known.has(url) || url.startsWith("maps/"));
}

async function readJson(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url} missing (${res.status})`);
  if (isHtmlResponse(res)) throw new Error(`${url} returned HTML`);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) throw new Error(`${url} returned HTML`);
  return JSON.parse(text);
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

function isHtmlResponse(res) {
  if (!res) return false;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  return ct.includes("text/html");
}

function isNonImageType(type) {
  const ct = String(type || "").toLowerCase();
  if (!ct) return false;
  if (ct.startsWith("image/")) return false;
  if (ct.includes("octet-stream") || ct.includes("binary")) return false;
  return true;
}

async function openCache(manifest) {
  if (!self.caches) return null;
  try {
    return await caches.open(cacheName(manifest.version));
  } catch {
    return null;
  }
}

function beginCritical() {
  criticalDepth += 1;
}

function endCritical() {
  criticalDepth = Math.max(0, criticalDepth - 1);
  if (criticalDepth === 0) {
    const waiters = criticalWaiters.splice(0);
    for (const resume of waiters) resume();
  }
}

function yieldToCritical() {
  if (criticalDepth <= 0) return Promise.resolve();
  return new Promise((resolve) => criticalWaiters.push(resolve));
}

async function warmFiles(urls, onProgress, manifest, {
  decodeImages = false,
  concurrency = 6,
  yieldToCritical: yieldCrit = false,
  required = false,
} = {}) {
  const cache = await openCache(manifest);
  let done = 0;
  const total = urls.length;
  await mapPool(urls, concurrency, async (url) => {
    if (yieldCrit) await yieldToCritical();
    const key = normalize(url);
    try {
      await warmOne(key, cache, decodeImages && isImage(key));
    } catch (err) {
      if (required) throw err;
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
      if (isNonImageType(blob.type)) {
        throw new Error(`Failed to cache ${key} (blob ${blob.type})`);
      }
      const img = new Image();
      img.decoding = "async";
      const objectUrl = URL.createObjectURL(blob);
      img.src = objectUrl;
      const ready = img.decode
        ? img.decode()
        : new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });
      try {
        await Promise.race([
          ready,
          sleep(1500).then(() => Promise.reject(new Error(`decode timeout ${key}`))),
        ]);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        images.delete(key);
        throw err;
      }
      if (!(img.naturalWidth || img.width)) {
        URL.revokeObjectURL(objectUrl);
        images.delete(key);
        throw new Error(`Failed to cache ${key} (empty image)`);
      }
      images.set(key, img);
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
    if (hit) {
      if (isHtmlResponse(hit) || (isImage(url) && isNonImageType(hit.headers.get("content-type")))) {
        cache.delete(href).catch(() => {});
      } else {
        return hit.blob();
      }
    }
  }
  const res = await fetch(href);
  if (!res.ok) throw new Error(`Failed to cache ${url} (${res.status})`);
  if (isHtmlResponse(res)) throw new Error(`Failed to cache ${url} (html fallback)`);
  if (isImage(url) && isNonImageType(res.headers.get("content-type"))) {
    throw new Error(`Failed to cache ${url} (non-image content-type)`);
  }
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
