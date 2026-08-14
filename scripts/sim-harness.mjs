#!/usr/bin/env node
/** DOM-free sim runner: N ticks at 60Hz, prints stable checksum JSON. */

import { createMatch, updateWorld } from "../js/sim/engine.js";
import { checksumWorld, mapLayoutFingerprint } from "../js/sim/checksum.js";
import { parseSeed } from "../js/sim/seed.js";

const args = process.argv.slice(2);
const ticksArg = args.find((a) => a.startsWith("--ticks="));
const seedArg = args.find((a) => a.startsWith("--seed="));
const ticks = ticksArg ? Number(ticksArg.split("=")[1]) : Number(process.env.SIM_TICKS || 240);
const seed = parseSeed(seedArg ? seedArg.split("=")[1] : process.env.SIM_SEED ?? "0x4d455249");
const dt = 1 / 60;

if (!Number.isFinite(ticks) || ticks < 0) {
  console.error("Invalid --ticks value");
  process.exit(1);
}

const world = createMatch({
  seed,
  playerFaction: "sunwoven",
  difficulty: "chieftain",
});

const mapFingerprint = mapLayoutFingerprint(world);

for (let i = 0; i < ticks; i += 1) {
  updateWorld(world, dt);
}

const report = {
  engine: "pixel-sim-harness",
  seed: seed >>> 0,
  seedHex: `0x${(seed >>> 0).toString(16)}`,
  ticks,
  dt,
  mapFingerprint,
  checksum: checksumWorld(world),
  t: world.t,
  units: world.units.length,
  buildings: world.buildings.length,
};

console.log(JSON.stringify(report, null, 2));
