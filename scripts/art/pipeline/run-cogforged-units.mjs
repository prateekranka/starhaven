#!/usr/bin/env node
/** Regenerate Cogforged pipeline atlases (issue #28). */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeUnitSources } from "./lib/source-templates.mjs";

const COG_UNITS = [
  { unitId: "cog-walk", faction: "cogforged" },
  { unitId: "cog-guard", faction: "cogforged" },
  { unitId: "cog-strider", faction: "cogforged" },
  { unitId: "cog-siege", faction: "cogforged" },
];

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const runUnit = join(root, "scripts/art/pipeline/run-unit.mjs");
const clips = "walk,attack,gather,build,death";

for (const { unitId, faction } of COG_UNITS) {
  const spec = {
    unitId,
    faction,
    kind: unitId.includes("guard") ? "guard" : unitId.includes("walk") ? "walk" : "still",
    sheet: "",
    still: "",
  };
  if (spec.kind === "guard") spec.sheet = "assets/sheets/sheet-cog-guard.png";
  else if (spec.kind === "walk") spec.sheet = "assets/sheets/sheet-cogforged-walk.png";
  else spec.still = `media/sprites/unit-cog-${unitId.replace("cog-", "")}.png`;
  writeUnitSources(spec);
  console.log(`\n=== ${unitId} ===`);
  const res = spawnSync(process.execPath, [runUnit, "--unit", unitId, "--faction", faction, "--clips", clips], {
    cwd: root,
    stdio: "inherit",
  });
  if (res.status !== 0) process.exit(res.status || 1);
}

console.log("\nCogforged atlases generated.");
