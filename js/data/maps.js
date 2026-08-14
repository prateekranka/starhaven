/** Load map manifest + map JSON for offline play. */

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

export async function loadMap(mapId = "bright-mesa") {
  const key = mapId || "bright-mesa";
  if (mapCache.has(key)) return mapCache.get(key);
  const manifest = await loadMapManifest();
  const entry = manifest.maps?.find((m) => m.id === key) || manifest.maps?.find((m) => m.default);
  if (!entry?.file) throw new Error(`Unknown map: ${key}`);
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

export async function populateMapSelect(selectEl, savedId) {
  if (!selectEl) return null;
  const manifest = await loadMapManifest();
  const current = savedId || manifest.maps?.find((m) => m.default)?.id || manifest.maps?.[0]?.id;
  const list = selectEl.querySelector(".ui-dropdown-list");
  if (list) {
    list.innerHTML = "";
    for (const m of manifest.maps || []) {
      const li = document.createElement("li");
      li.className = "ui-dropdown-option" + (m.id === current ? " selected" : "");
      li.setAttribute("role", "option");
      li.dataset.value = m.id;
      li.setAttribute("aria-selected", m.id === current ? "true" : "false");
      li.textContent = m.name || m.id;
      list.appendChild(li);
    }
    const hidden = selectEl.querySelector('input[type="hidden"]');
    if (hidden) hidden.value = current;
    selectEl.dataset.value = current;
    const selected = manifest.maps?.find((m) => m.id === current);
    const label = selectEl.querySelector(".ui-dropdown-label");
    if (label && selected) label.textContent = selected.name || selected.id;
    return current;
  }
  selectEl.innerHTML = "";
  for (const m of manifest.maps || []) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name || m.id;
    if (m.id === current) opt.selected = true;
    selectEl.appendChild(opt);
  }
  return current;
}
