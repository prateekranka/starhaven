#!/usr/bin/env node
/** Regenerate Stormveil pipeline atlases (issue #29). */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeUnitSources } from "./lib/source-templates.mjs";

const STORM_UNITS = [
  { unitId: "storm-walk", faction: "stormveil" },
  { unitId: "storm-guard", faction: "stormveil" },
  { unitId: "storm-strider", faction: "stormveil" },
  { unitId: "storm-siege", faction: "stormveil" },
  { unitId: "storm-wagon", faction: "stormveil" },
];

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const runUnit = join(root, "scripts/art/pipeline/run-unit.mjs");
const clips = "walk,attack,gather,build,death";

for (const { unitId, faction } of STORM_UNITS) {
  const spec = { unitId, faction, kind: unitId.includes("guard") ? "guard" : unitId.includes("walk") ? "walk" : "still", sheet: "", still: "" };
  if (spec.kind === "guard") spec.sheet = "assets/sheets/sheet-storm-guard.png";
  else if (spec.kind === "walk") spec.sheet = "assets/sheets/sheet-stormveil-walk.png";
  else spec.still = `media/sprites/unit-storm-${unitId.replace("storm-", "")}.png`;
  writeUnitSources(spec);
  console.log(`\n=== ${unitId} ===`);
  const res = spawnSync(process.execPath, [runUnit, "--unit", unitId, "--faction", faction, "--clips", clips], {
    cwd: root,
    stdio: "inherit",
  });
  if (res.status !== 0) process.exit(res.status || 1);
}

console.log("\nStormveil atlases generated.");
