#!/usr/bin/env node
/** Headless civ matrix: Cogforged matches resolve; baseline checksum captured. */

import { createMatch, updateWorld } from "../js/sim/engine.js";
import { checksumWorld } from "../js/sim/checksum.js";
import { parseSeed } from "../js/sim/seed.js";

const dt = 1 / 60;
const seed = parseSeed(process.env.SIM_SEED ?? "0x4d455249");
const ticks = Number(process.env.SIM_TICKS || 18000);

const scenarios = [
  { label: "sunwoven-baseline", playerFaction: "sunwoven", enemyFaction: "gravemark" },
  { label: "cogforged-player", playerFaction: "cogforged", enemyFaction: "sunwoven" },
  { label: "cogforged-enemy", playerFaction: "sunwoven", enemyFaction: "cogforged" },
];

const results = [];
for (const scenario of scenarios) {
  const world = createMatch({ seed, ...scenario, difficulty: "chieftain" });
  for (let i = 0; i < ticks && !world.winner; i += 1) updateWorld(world, dt);
  results.push({ label: scenario.label, winner: world.winner, t: world.t, checksum: checksumWorld(world) });
}

const baseline = results.find((r) => r.label === "sunwoven-baseline");
const report = {
  engine: "sim-civ-batch",
  seed: seed >>> 0,
  ticks,
  baselineChecksum: baseline?.checksum,
  results,
  ok: results.every((r) => r.checksum),
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
