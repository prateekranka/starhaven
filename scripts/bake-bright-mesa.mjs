#!/usr/bin/env node
/** Bake Bright Mesa layout + terrain into maps/bright-mesa.json (schema v1). */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const N = 48;
const CELL = 2;
const MAP = N * CELL;
const DEFAULT_SEED = 0x4d455249;

function hash(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

class DeterministicPrng {
  constructor(seed) {
    this.state = (seed >>> 0 || 0x9e3779b9) >>> 0;
  }
  nextUint() {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }
  nextInt(min, max) {
    return min + (this.nextUint() % (max - min + 1));
  }
}

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, oct = 5) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    sum += noise(x * f, z * f) * amp;
    f *= 2.05;
    amp *= 0.5;
  }
  return sum;
}
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
function landH(x, z) {
  const nx = Math.min(x, MAP - x);
  const nz = Math.min(z, MAP - z);
  const rim = Math.min(nx, nz);
  const wx = x + fbm(x * 0.04, z * 0.04, 3) * 5;
  const wz = z + fbm(x * 0.04 + 19, z * 0.04 - 11, 3) * 5;
  let h = 1.9 * smoothstep(2.4, 10, rim);
  h += (fbm(wx * 0.055, wz * 0.055, 4) - 0.42) * 0.4;
  if (rim > 11) {
    const crater = Math.hypot(x / MAP - 0.48, z / MAP - 0.44);
    h -= Math.max(0, 0.16 - crater * 6.5) * 0.55;
  }
  return Math.max(0, h);
}

const CHAR = ["s", "d", "g", "r", "c", "v"];

function biomeAt(x, z) {
  let y = landH(x, z);
  const rim = Math.min(Math.min(x, MAP - x), Math.min(z, MAP - z));
  if (rim < 1.8) y = -2.2;
  else if (rim < 8.5) y = -1.55 + (Math.max(0.35, y) + 1.55) * smoothstep(1.8, 8.5, rim);
  const moist = fbm(x * 0.05, z * 0.05, 3);
  if (y < 0.05) return "c";
  if (rim < 6.2) return "v";
  if (rim < 10.5) return "r";
  if (moist > 0.74) return "g";
  if (moist > 0.55) return "d";
  return "s";
}

function nearStart(cx, cz) {
  return Math.hypot(cx - 6, cz - 40) < 5 || Math.hypot(cx - 40, cz - 7) < 5;
}

const props = [];
const walk = Array(N * N).fill("1");
let terrain = "";

for (let z = 0; z < N; z++) {
  for (let x = 0; x < N; x++) {
    const xw = (x + 0.5) * CELL;
    const zw = (z + 0.5) * CELL;
    const b = biomeAt(xw, zw);
    terrain += b;
    if (b === "c" || b === "v") walk[z * N + x] = "0";
    const h = hash(x, z);
    if (h > 0.93 && x > 8 && z > 8 && x < N - 8 && z < N - 8) {
      walk[z * N + x] = "0";
      props.push({ kind: "rock", cx: x, cz: z });
    }
  }
}

const rng = new DeterministicPrng(DEFAULT_SEED ^ 0x45564e54);
const scatterPlan = [
  ["food", 18, 90],
  ["wood", 22, 110],
  ["crystal", 10, 80],
  ["ore", 8, 70],
];
const resources = [];
for (const [kind, count, amount] of scatterPlan) {
  let n = 0;
  let tries = 0;
  while (n < count && tries++ < 400) {
    const cx = rng.nextInt(2, N - 3);
    const cz = rng.nextInt(2, N - 3);
    if (walk[cz * N + cx] === "0") continue;
    if (nearStart(cx, cz)) continue;
    resources.push({ kind, cx, cz, amount: amount + rng.nextInt(0, 39) });
    n++;
  }
}

const map = {
  schema: 1,
  id: "bright-mesa",
  name: "Bright Mesa",
  size: N,
  cell: CELL,
  terrain,
  walk: walk.join(""),
  starts: {
    player: { cx: 6, cz: 40, reveal: 16 },
    enemy: { cx: 40, cz: 7, reveal: 12 },
  },
  startNodes: [
    ["food", 5, 1],
    ["food", 6, 1],
    ["food", 5, 2],
    ["food", 6, 2],
    ["wood", -2, 5],
    ["wood", -1, 5],
    ["wood", -2, 6],
    ["crystal", 5, -2],
    ["crystal", 6, -2],
    ["ore", -3, -1],
  ],
  relic: { cx: 23, cz: 23 },
  resources,
  props,
};

const outDir = join(root, "maps");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "bright-mesa.json"), `${JSON.stringify(map, null, 2)}\n`);
console.log(`Wrote bright-mesa.json (${resources.length} scatter nodes, ${props.length} rocks)`);
