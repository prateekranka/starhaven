#!/usr/bin/env node
/** Regenerate Ashvein pipeline atlases (issue #30). */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeUnitSources } from "./lib/source-templates.mjs";

const ASH_UNITS = [
  { unitId: "ash-walk", faction: "ashvein" },
  { unitId: "ash-guard", faction: "ashvein" },
  { unitId: "ash-strider", faction: "ashvein" },
  { unitId: "ash-siege", faction: "ashvein" },
];

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const runUnit = join(root, "scripts/art/pipeline/run-unit.mjs");
const clips = "walk,attack,gather,build,death";

for (const { unitId, faction } of ASH_UNITS) {
  const spec = {
    unitId,
    faction,
    kind: unitId.includes("guard") ? "guard" : unitId.includes("walk") ? "walk" : "still",
    sheet: "",
    still: "",
  };
  if (spec.kind === "guard") spec.sheet = "assets/sheets/sheet-ash-guard.png";
  else if (spec.kind === "walk") spec.sheet = "assets/sheets/sheet-ashvein-walk.png";
  else spec.still = `media/sprites/unit-ash-${unitId.replace("ash-", "")}.png`;
  writeUnitSources(spec);
  console.log(`\n=== ${unitId} ===`);
  const res = spawnSync(process.execPath, [runUnit, "--unit", unitId, "--faction", faction, "--clips", clips], {
    cwd: root,
    stdio: "inherit",
  });
  if (res.status !== 0) process.exit(res.status || 1);
}

console.log("\nAshvein atlases generated.");
