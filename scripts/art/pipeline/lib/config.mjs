import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");

export function loadJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

export function repoPath(...parts) {
  return join(root, ...parts);
}

export function loadPipelineConfig() {
  const spec = loadJson("assets/pipeline/sheet-spec.v1.json");
  const inbetweening = loadJson("assets/pipeline/inbetweening.v1.json");
  return { spec, inbetweening, root };
}

export function loadPalette(faction) {
  const file = faction === "gravemark" ? "gravemark.v1.json" : faction === "meridian" ? "meridian.v1.json" : "sunwoven.v1.json";
  return loadJson(`assets/palettes/${file}`);
}

export function loadUnitSources(unitId) {
  return loadJson(`assets/provenance/units/${unitId}.sources.v1.json`);
}

export const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const SOURCE_DIRECTIONS = ["N", "NE", "E", "SE", "S"];
export const MIRROR_SOURCE = { SW: "SE", W: "E", NW: "NE" };

export const PNG_OPTS = { compressionLevel: 9, adaptiveFiltering: false, palette: false };
