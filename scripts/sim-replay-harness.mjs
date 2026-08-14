#!/usr/bin/env node
/** Record a match, replay twice, assert equal periodic checksums. */

import { recordHarnessMatch, encodeReplay, decodeReplay, replayToChecksums } from "../js/sim/replay.js";
import { parseSeed } from "../js/sim/seed.js";

const args = process.argv.slice(2);
const seedArg = args.find((a) => a.startsWith("--seed="));
const ticksArg = args.find((a) => a.startsWith("--ticks="));
const seed = parseSeed(seedArg ? seedArg.split("=")[1] : "0x4d455249");
const ticks = ticksArg ? Number(ticksArg.split("=")[1]) : 240;
const interval = 60;

const { recorder, finalChecksum } = recordHarnessMatch({ seed, ticks, interval });
const encoded = encodeReplay(recorder.data);
const replay = decodeReplay(encoded);
const runA = replayToChecksums(replay, ticks, interval);
const runB = replayToChecksums(replay, ticks, interval);

const equalPeriodic = runA.length === runB.length && runA.every((row, i) => row.tick === runB[i].tick && row.checksum === runB[i].checksum);
const equalFinal = runA.at(-1)?.checksum === finalChecksum && runB.at(-1)?.checksum === finalChecksum;

const report = {
  engine: "pixel-sim-replay-harness",
  seed: seed >>> 0,
  seedHex: `0x${(seed >>> 0).toString(16)}`,
  ticks,
  interval,
  commandCount: replay.commands.length,
  periodicChecksums: runA,
  replayEqual: equalPeriodic && equalFinal,
  finalChecksum,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.replayEqual ? 0 : 1);
