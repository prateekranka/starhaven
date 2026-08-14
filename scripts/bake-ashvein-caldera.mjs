#!/usr/bin/env node
/** Bake Ashvein Caldera showpiece map (#27). */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BIOME_RGB } from "../js/data/map-biomes.js";

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
let rects = "";
for (let z = 0; z < n; z += 1) {
  for (let x = 0; x < n; x += 1) {
    const ch = base.terrain[z * n + x];
    const biome = { s: "sand", d: "dirt", g: "grass", r: "rock", c: "cliff", v: "void" }[ch] || "sand";
    const [r, g, b] = BIOME_RGB[biome];
    let fill = `rgb(${r},${g},${b})`;
    const prop = base.props.find((p) => p.cx === x && p.cz === z);
    if (prop?.kind === "lava-vent") fill = "#dc4018";
    if (prop?.kind === "tunnel-entrance") fill = "#4a3020";
    if (prop?.kind === "tunnel") fill = "#2a1810";
    rects += `<rect x="${x * px}" y="${z * px}" width="${px}" height="${px}" fill="${fill}"/>`;
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n * px} ${n * px}" width="${n * px}" height="${n * px}">${rects}</svg>\n`;
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
