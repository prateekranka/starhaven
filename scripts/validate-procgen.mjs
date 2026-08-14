#!/usr/bin/env node
/** Validate 20 procedural seeds: reachability + resource parity + determinism. */

import { generateSkirmishMap, validateSkirmishMap, mapLayoutFingerprint } from "../js/sim/procgen.js";
import { parseSeed } from "../js/sim/seed.js";

const seeds = [
  "0x4d455249",
  "0xdeadbeef",
  "0xcafebabe",
  "12345",
  "0x11111111",
  "0x22222222",
  "0x33333333",
  "0x44444444",
  "0x55555555",
  "0x66666666",
  "0x77777777",
  "0x88888888",
  "0x99999999",
  "0xaaaaaaaa",
  "0xbbbbbbbb",
  "0xcccccccc",
  "0xdddddddd",
  "0xeeeeeeee",
  "0xffffffff",
  "90210",
];

const results = [];
let ok = true;

for (const raw of seeds) {
  const seed = parseSeed(raw);
  const a = generateSkirmishMap(seed, 96);
  const b = generateSkirmishMap(seed, 96);
  const fpA = JSON.stringify(mapLayoutFingerprint(a));
  const fpB = JSON.stringify(mapLayoutFingerprint(b));
  const identical = fpA === fpB && a.terrain === b.terrain;
  const check = validateSkirmishMap(a);
  const pass = identical && check.ok;
  if (!pass) ok = false;
  results.push({
    seed: raw,
    seedHex: `0x${(seed >>> 0).toString(16)}`,
    identical,
    validation: check,
    pass,
  });
}

const report = { procgenBatch: ok ? "pass" : "fail", count: seeds.length, results };
console.log(JSON.stringify(report, null, 2));
process.exit(ok ? 0 : 1);
