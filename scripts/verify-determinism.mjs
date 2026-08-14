#!/usr/bin/env node
/** Run sim lint, harness checksum stability, and replay equality proof. */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

function run(script, args = []) {
  const res = spawnSync(node, [join(root, script), ...args], { encoding: "utf8" });
  return { script, code: res.status ?? 1, stdout: res.stdout?.trim() ?? "", stderr: res.stderr?.trim() ?? "" };
}

const lint = run("sim-lint.mjs");
const harnessA = run("sim-harness.mjs", ["--seed=0x4d455249", "--ticks=240"]);
const harnessB = run("sim-harness.mjs", ["--seed=0x4d455249", "--ticks=240"]);
const replay = run("sim-replay-harness.mjs", ["--seed=0x4d455249", "--ticks=240"]);

let checksumA = null;
let checksumB = null;
try {
  checksumA = JSON.parse(harnessA.stdout).checksum;
  checksumB = JSON.parse(harnessB.stdout).checksum;
} catch {
  /* parse errors handled below */
}

const harnessStable = checksumA != null && checksumA === checksumB;
const replayOk = replay.code === 0;

const report = {
  simLint: lint.code === 0 ? "pass" : "fail",
  harnessStable,
  checksum: checksumA,
  replayEqual: replayOk,
  ok: lint.code === 0 && harnessStable && replayOk,
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) {
  if (lint.code !== 0) console.error(lint.stdout || lint.stderr);
  if (!harnessStable) console.error("Harness checksum mismatch", checksumA, checksumB);
  if (!replayOk) console.error(replay.stdout || replay.stderr);
  process.exit(1);
}
