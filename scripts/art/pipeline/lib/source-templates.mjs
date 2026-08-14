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

export function guardSources(unitId, faction, sheet) {
  return {
    id: `${unitId}.sources.v1`,
    unitId,
    faction,
    sheet,
    cellSize: 128,
    directionRows: DIRECTION_ROWS,
    clips: loadShared("_shared.guard-clips.json"),
  };
}

export function walkSources(unitId, faction, sheet) {
  return {
    id: `${unitId}.sources.v1`,
    unitId,
    faction,
    sheet,
    cellSize: 128,
    directionRows: DIRECTION_ROWS,
    clips: loadShared("_shared.walk-clips.json"),
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
  { unitId: "sun-walk", faction: "sunwoven", kind: "walk", sheet: "media/sprites/sheet-sunwoven-walk.png" },
  { unitId: "grave-walk", faction: "gravemark", kind: "walk", sheet: "media/sprites/sheet-gravemark-walk.png" },
  { unitId: "sun-strider", faction: "sunwoven", kind: "still", still: "media/sprites/unit-sun-strider.png" },
  { unitId: "grave-strider", faction: "gravemark", kind: "still", still: "media/sprites/unit-grave-strider.png" },
  { unitId: "sun-siege", faction: "sunwoven", kind: "still", still: "media/sprites/unit-sun-siege.png" },
  { unitId: "grave-siege", faction: "gravemark", kind: "still", still: "media/sprites/unit-grave-siege.png" },
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
