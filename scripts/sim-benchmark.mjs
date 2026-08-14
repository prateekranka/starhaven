#!/usr/bin/env node
/** Micro-benchmark A* and staggered vision on 48×48 and 96×96 grids. */

import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { astar } from "../js/sim/path.js";
import { createMatch, updateWorld } from "../js/sim/engine.js";
import { normalizeMap } from "../js/sim/map-loader.js";

const root = dirname(fileURLToPath(import.meta.url));
const dt = 1 / 60;

function openWalk(n) {
  return new Uint8Array(n * n).fill(1);
}

function benchAstar(walk, n, runs = 200) {
  const sx = (n / 4) | 0;
  const sz = (n / 4) | 0;
  const gx = n - 1 - sx;
  const gz = n - 1 - sz;
  const t0 = performance.now();
  for (let i = 0; i < runs; i += 1) astar(walk, n, sx, sz, gx, gz);
  return { ms: performance.now() - t0, runs, perCallUs: ((performance.now() - t0) / runs) * 1000 };
}

function benchVision(ticks = 240) {
  const t0 = performance.now();
  const world = createMatch({ seed: 0x4d455249, playerFaction: "sunwoven", difficulty: "chieftain" });
  for (let i = 0; i < ticks; i += 1) updateWorld(world, dt);
  return { ms: performance.now() - t0, ticks, perTickUs: ((performance.now() - t0) / ticks) * 1000 };
}

function loadBrightMesa() {
  const raw = JSON.parse(readFileSync(join(root, "../maps/bright-mesa.json"), "utf8"));
  return normalizeMap(raw);
}

const bright = loadBrightMesa();
const walk96 = openWalk(96);

const report = {
  engine: "sim-benchmark",
  astar: {
    grid48: benchAstar(bright.walk, 48),
    grid96: benchAstar(walk96, 96),
  },
  visionStagger: {
    brightMesa48: benchVision(240),
  },
};

console.log(JSON.stringify(report, null, 2));
