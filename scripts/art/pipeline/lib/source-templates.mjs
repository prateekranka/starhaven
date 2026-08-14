import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { repoPath } from "./config.mjs";

const DIRECTION_ROWS = {
  S: 0,
  SE: 1,
  E: 2,
  NE: 3,
  N: 4,
  NW: 5,
  W: 6,
  SW: 7,
};

function loadShared(name) {
  return JSON.parse(readFileSync(repoPath("assets", "provenance", "units", name), "utf8"));
}

const TRUECYCLE = new Set(["cogforged", "ashvein", "stormveil"]);

function clipSheets(walkSheet, faction) {
  if (!TRUECYCLE.has(faction)) {
    return { walk: walkSheet, attack: walkSheet, death: walkSheet, gather: walkSheet, build: walkSheet };
  }
  if (walkSheet.includes("-walk.png")) {
    return {
      walk: walkSheet,
      attack: walkSheet.replace("-walk.png", "-attack.png"),
      death: walkSheet.replace("-walk.png", "-death.png"),
      gather: walkSheet,
      build: walkSheet,
    };
  }
  const base = walkSheet.replace(/\.png$/, "");
  return {
    walk: walkSheet,
    attack: `${base}-attack.png`,
    death: `${base}-death.png`,
    gather: walkSheet,
    build: walkSheet,
  };
}

export function guardSources(unitId, faction, sheet) {
  const clips = TRUECYCLE.has(faction) ? "_truecycle.guard-clips.json" : "_shared.guard-clips.json";
  return {
    id: `${unitId}.sources.v1`,
    unitId,
    faction,
    sheet,
    sheets: clipSheets(sheet, faction),
    cellSize: 128,
    directionRows: DIRECTION_ROWS,
    clips: loadShared(clips),
  };
}

export function walkSources(unitId, faction, sheet) {
  const clips = TRUECYCLE.has(faction) ? "_truecycle.walk-clips.json" : "_shared.walk-clips.json";
  return {
    id: `${unitId}.sources.v1`,
    unitId,
    faction,
    sheet,
    sheets: clipSheets(sheet, faction),
    cellSize: 128,
    directionRows: DIRECTION_ROWS,
    clips: loadShared(clips),
  };
}

export function stillSources(unitId, faction, still) {
  return {
    id: `${unitId}.sources.v1`,
    unitId,
    faction,
    mode: "still",
    still,
    cellSize: 128,
    directionRows: DIRECTION_ROWS,
    clips: loadShared("_shared.walk-clips.json"),
  };
}

export const UNIT_SOURCE_SPECS = [
  { unitId: "sun-guard", faction: "sunwoven", kind: "guard", sheet: "media/sprites/sheet-sun-guard.png" },
  { unitId: "grave-guard", faction: "gravemark", kind: "guard", sheet: "media/sprites/sheet-grave-guard.png" },
  { unitId: "storm-guard", faction: "stormveil", kind: "guard", sheet: "media/sprites/sheet-storm-guard.png" },
  { unitId: "ash-guard", faction: "ashvein", kind: "guard", sheet: "media/sprites/sheet-ash-guard.png" },
  { unitId: "cog-guard", faction: "cogforged", kind: "guard", sheet: "media/sprites/sheet-cog-guard.png" },
  { unitId: "sun-walk", faction: "sunwoven", kind: "walk", sheet: "media/sprites/sheet-sunwoven-walk.png" },
  { unitId: "grave-walk", faction: "gravemark", kind: "walk", sheet: "media/sprites/sheet-gravemark-walk.png" },
  { unitId: "storm-walk", faction: "stormveil", kind: "walk", sheet: "media/sprites/sheet-stormveil-walk.png" },
  { unitId: "ash-walk", faction: "ashvein", kind: "walk", sheet: "media/sprites/sheet-ashvein-walk.png" },
  { unitId: "cog-walk", faction: "cogforged", kind: "walk", sheet: "media/sprites/sheet-cogforged-walk.png" },
  { unitId: "sun-strider", faction: "sunwoven", kind: "still", still: "media/sprites/unit-sun-strider.png" },
  { unitId: "grave-strider", faction: "gravemark", kind: "still", still: "media/sprites/unit-grave-strider.png" },
  { unitId: "storm-strider", faction: "stormveil", kind: "still", still: "media/sprites/unit-storm-strider.png" },
  { unitId: "ash-strider", faction: "ashvein", kind: "still", still: "media/sprites/unit-ash-strider.png" },
  { unitId: "cog-strider", faction: "cogforged", kind: "still", still: "media/sprites/unit-cog-strider.png" },
  { unitId: "sun-siege", faction: "sunwoven", kind: "still", still: "media/sprites/unit-sun-siege.png" },
  { unitId: "grave-siege", faction: "gravemark", kind: "still", still: "media/sprites/unit-grave-siege.png" },
  { unitId: "storm-siege", faction: "stormveil", kind: "still", still: "media/sprites/unit-storm-siege.png" },
  { unitId: "ash-siege", faction: "ashvein", kind: "still", still: "media/sprites/unit-ash-siege.png" },
  { unitId: "cog-siege", faction: "cogforged", kind: "still", still: "media/sprites/unit-cog-siege.png" },
  { unitId: "storm-wagon", faction: "stormveil", kind: "still", still: "media/sprites/unit-storm-wagon.png" },
];

export function writeUnitSources(spec) {
  const out = join(repoPath("assets", "provenance", "units"), `${spec.unitId}.sources.v1.json`);
  mkdirSync(repoPath("assets", "provenance", "units"), { recursive: true });
  let json;
  if (spec.kind === "guard") json = guardSources(spec.unitId, spec.faction, spec.sheet);
  else if (spec.kind === "walk") json = walkSources(spec.unitId, spec.faction, spec.sheet);
  else json = stillSources(spec.unitId, spec.faction, spec.still);
  writeFileSync(out, `${JSON.stringify(json, null, 2)}\n`);
  return out;
}
