#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const N = 48;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let terrain = "";
const walk = Array(N * N).fill("1");

for (let z = 0; z < N; z++) {
  for (let x = 0; x < N; x++) {
    const rim = Math.min(x, z, N - 1 - x, N - 1 - z);
    let b = "s";
    if (rim < 3) {
      b = "v";
      walk[z * N + x] = "0";
    } else if (rim < 5) {
      b = "c";
      walk[z * N + x] = "0";
    } else if ((x + z) % 11 === 0) b = "d";
    else if ((x * z) % 17 === 0) b = "g";
    terrain += b;
  }
}

const props = [
  { kind: "rock", cx: 20, cz: 22 },
  { kind: "rock", cx: 28, cz: 26 },
];
for (const p of props) walk[p.cz * N + p.cx] = "0";

const map = {
  schema: 1,
  id: "training-flat",
  name: "Training Flat",
  size: N,
  cell: 2,
  terrain,
  walk: walk.join(""),
  starts: {
    player: { cx: 8, cz: 36, reveal: 14 },
    enemy: { cx: 36, cz: 10, reveal: 14 },
  },
  startNodes: [
    ["food", 4, 1],
    ["food", 5, 1],
    ["wood", -2, 4],
    ["crystal", 4, -2],
    ["ore", -3, 0],
  ],
  relic: { cx: 24, cz: 24 },
  resources: [
    { kind: "food", cx: 18, cz: 30, amount: 120 },
    { kind: "food", cx: 30, cz: 18, amount: 120 },
    { kind: "wood", cx: 14, cz: 20, amount: 140 },
    { kind: "wood", cx: 34, cz: 28, amount: 140 },
    { kind: "crystal", cx: 22, cz: 14, amount: 90 },
    { kind: "crystal", cx: 26, cz: 32, amount: 90 },
    { kind: "ore", cx: 16, cz: 26, amount: 80 },
    { kind: "ore", cx: 32, cz: 16, amount: 80 },
  ],
  props,
};

writeFileSync(join(root, "maps/training-flat.json"), `${JSON.stringify(map, null, 2)}\n`);
console.log("Wrote training-flat.json");
