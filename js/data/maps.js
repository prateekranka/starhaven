/** Load map manifest + map JSON for offline play. */

import { parseSeed } from "../sim/seed.js";

const manifestCache = { promise: null, data: null };
const mapCache = new Map();

export async function loadMapManifest() {
  if (manifestCache.data) return manifestCache.data;
  if (!manifestCache.promise) {
    manifestCache.promise = fetch("maps/manifest.json", { cache: "no-cache" })
      .then((res) => {
        if (!res.ok) throw new Error("maps/manifest.json missing");
        return res.json();
      })
      .then((data) => {
        manifestCache.data = data;
        return data;
      });
  }
  return manifestCache.promise;
}

export async function loadMap(mapId = "bright-mesa", seed) {
  const manifest = await loadMapManifest();
  const entry = manifest.maps?.find((m) => m.id === mapId) || manifest.maps?.find((m) => m.default);
  if (!entry) throw new Error(`Unknown map: ${mapId}`);

  if (entry.procgen) {
    const s = parseSeed(seed ?? 0x4d455249);
    const cacheKey = `procgen:${entry.id}:${s >>> 0}:${entry.size || 96}`;
    if (mapCache.has(cacheKey)) return mapCache.get(cacheKey);
    const { generateSkirmishMap } = await import("../sim/procgen.js");
    const map = generateSkirmishMap(s, entry.size || 96, entry.cell || 2);
    mapCache.set(cacheKey, map);
    return map;
  }

  const key = mapId || "bright-mesa";
  if (mapCache.has(key)) return mapCache.get(key);
  if (!entry.file) throw new Error(`Unknown map: ${key}`);
  const res = await fetch(entry.file, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load map ${entry.file}`);
  const map = await res.json();
  mapCache.set(key, map);
  mapCache.set(map.id, map);
  return map;
}

export function mapAssetUrls(manifest) {
  const urls = ["maps/manifest.json"];
  for (const m of manifest?.maps || []) {
    if (m.file) urls.push(m.file);
  }
  return urls;
}

export function describeMapEntry(entry) {
  if (!entry) return { name: "Unknown", blurb: "", preview: null };
  return {
    name: entry.name || entry.id,
    blurb: entry.blurb || "",
    preview: entry.preview || null,
    size: entry.size || (entry.procgen ? 96 : 48),
  };
}

export async function populateMapSelect(selectEl, savedId, onPick) {
  if (!selectEl) return null;
  const manifest = await loadMapManifest();
  const maps = manifest.maps || [];
  const current = savedId || maps.find((m) => m.default)?.id || maps[0]?.id;
  selectEl.innerHTML = "";
  for (const m of maps) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name || m.id;
    opt.dataset.blurb = m.blurb || "";
    opt.dataset.preview = m.preview || "";
    if (m.id === current) opt.selected = true;
    selectEl.appendChild(opt);
  }
  const notify = () => {
    const entry = maps.find((m) => m.id === selectEl.value) || maps[0];
    onPick?.(describeMapEntry(entry));
  };
  selectEl.onchange = notify;
  notify();
  return current;
}
