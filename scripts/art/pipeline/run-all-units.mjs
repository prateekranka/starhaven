#!/usr/bin/env node
/** Regenerate every pipeline unit atlas (issue #12 rollout). Run from pipeline-tmp: node ../scripts/art/pipeline/run-all-units.mjs */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { UNIT_SOURCE_SPECS, writeUnitSources } from "./lib/source-templates.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const clips = "walk,attack,gather,build,death";
const runUnit = join(root, "scripts/art/pipeline/run-unit.mjs");

for (const spec of UNIT_SOURCE_SPECS) {
  writeUnitSources(spec);
  console.log(`\n=== ${spec.unitId} (${spec.faction}) ===`);
  const res = spawnSync(process.execPath, [runUnit, "--unit", spec.unitId, "--faction", spec.faction, "--clips", clips], {
    cwd: join(root, "pipeline-tmp"),
    stdio: "inherit",
    env: { ...process.env, NODE_PATH: join(root, "pipeline-tmp", "node_modules") },
  });
  if (res.status !== 0) process.exit(res.status || 1);
}

console.log("\nAll unit atlases generated.");
