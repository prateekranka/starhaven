#!/usr/bin/env node
/** Bake Ashvein Caldera showpiece map (#27). */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { terrainSvg } from "../js/data/map-biomes.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = JSON.parse(readFileSync(join(root, "maps/bright-mesa.json"), "utf8"));

base.id = "ashvein-caldera";
base.name = "Ashvein Caldera";
base.props = [
  { kind: "tunnel-entrance", cx: 14, cz: 34 },
  { kind: "tunnel-entrance", cx: 34, cz: 14 },
  { kind: "tunnel-entrance", cx: 24, cz: 24 },
  { kind: "tunnel", cx: 16, cz: 28 },
  { kind: "tunnel", cx: 18, cz: 26 },
  { kind: "tunnel", cx: 20, cz: 24 },
  { kind: "tunnel", cx: 22, cz: 22 },
  { kind: "tunnel", cx: 24, cz: 20 },
  { kind: "tunnel", cx: 26, cz: 18 },
  { kind: "tunnel", cx: 28, cz: 16 },
  { kind: "lava-vent", cx: 22, cz: 30 },
  { kind: "lava-vent", cx: 30, cz: 22 },
  { kind: "lava-vent", cx: 24, cz: 18 },
];

writeFileSync(join(root, "maps/ashvein-caldera.json"), `${JSON.stringify(base, null, 2)}\n`);

const n = base.size;
const px = 4;
const propFill = {
  "lava-vent": ["L", "#dc4018"],
  "tunnel-entrance": ["E", "#4a3020"],
  tunnel: ["T", "#2a1810"],
};
const cells = base.terrain.split("");
for (const p of base.props) {
  const hit = propFill[p.kind];
  if (hit) cells[p.cz * n + p.cx] = hit[0];
}
const svg = terrainSvg(cells.join(""), n, px, { L: "#dc4018", E: "#4a3020", T: "#2a1810" });
writeFileSync(join(root, "media/maps/ashvein-caldera.svg"), svg);

const manifest = JSON.parse(readFileSync(join(root, "maps/manifest.json"), "utf8"));
if (!manifest.maps.some((m) => m.id === "ashvein-caldera")) {
  manifest.maps.splice(4, 0, {
    id: "ashvein-caldera",
    name: "Ashvein Caldera",
    file: "maps/ashvein-caldera.json",
    blurb: "Central caldera vents and a staged tunnel spine — Ashvein's lava bridges reshape the choke mid-game.",
    preview: "media/maps/ashvein-caldera.svg",
  });
  writeFileSync(join(root, "maps/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log("Wrote ashvein-caldera map + preview + manifest entry");
