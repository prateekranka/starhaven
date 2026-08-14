#!/usr/bin/env node
/** Headless fairness checks for authored showpiece maps. */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMatch, updateWorld } from "../js/sim/engine.js";
import { normalizeMap } from "../js/sim/map-loader.js";
import { validateSkirmishMap } from "../js/sim/procgen.js";
import { astar } from "../js/sim/path.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dt = 1 / 60;
const SHOWPIECE = ["void-rift-crossing", "highland-chokes", "crystal-basin"];

function loadRaw(id) {
  return JSON.parse(readFileSync(join(root, "maps", `${id}.json`), "utf8"));
}

function simProbe(raw, seed, ticks = 1800) {
  const world = createMatch({ seed, map: raw, mapId: raw.id, playerFaction: "sunwoven", difficulty: "chieftain" });
  for (let i = 0; i < ticks; i += 1) updateWorld(world, dt);
  const pUnits = world.units.filter((u) => u.owner === "player").length;
  const eUnits = world.units.filter((u) => u.owner === "enemy").length;
  return { winner: world.winner, pUnits, eUnits, t: world.t };
}

const results = [];
let ok = true;

for (const id of SHOWPIECE) {
  const raw = loadRaw(id);
  const map = normalizeMap(raw);
  const ps = map.starts.player;
  const es = map.starts.enemy;
  const pathLen = astar(map.walk, map.size, ps.cx, ps.cz, es.cx, es.cz).length;
  const layout = validateSkirmishMap(raw);
  const runA = simProbe(raw, 0x51000001);
  const runB = simProbe(raw, 0x51000002);
  const fair = layout.ok && pathLen > 0 && runA.pUnits > 0 && runB.eUnits > 0;
  if (!fair) ok = false;
  results.push({ id, pathLen, layout, runA, runB, fair });
}

const report = { showpieceFairness: ok ? "pass" : "fail", results };
console.log(JSON.stringify(report, null, 2));
process.exit(ok ? 0 : 1);
