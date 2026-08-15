#!/usr/bin/env node
/** Fixed-day absence and neutral-multiplier audit. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCiv } from "../js/data/civ-schema.js";
import "../js/data/civs.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CIV_IDS = ["sunwoven", "gravemark", "cogforged", "stormveil", "ashvein"];
const NEUTRAL = Object.freeze({ speed: 1000, dmg: 1000, armor: 1000 });

// Bright Mesa and Bright Frontier are product/map names, not gameplay mechanics.
const RETAINED_BRIGHT_REFERENCES = Object.freeze({
  "index.html": ["bright-mesa", "Bright Mesa", "BRIGHT FRONTIER"],
  "maps/manifest.json": ["bright-mesa", "Bright Mesa"],
});

const SOURCE_FILES = [
  "index.html",
  "css/app.css",
  "js/ui/title-vista.js",
  "js/data/civ-schema.js",
  "js/data/civs.js",
  "js/sim/engine.js",
  "js/sim/civs/index.js",
  "js/sim/civs/stormveil.js",
  "js/game/main.js",
  "js/game/render.js",
  "js/audio/score.js",
];

const ABSENCE_CHECKS = [
  ["world.bright", /\bworld\.bright\b/g],
  ["brightQ10", /\bbrightQ10\b/g],
  ["inLight", /\binLight\b/g],
  ["inDark", /\binDark\b/g],
  ["lineX", /\blineX\b/g],
  ["trySummonDarkness", /\btrySummonDarkness\b/g],
  ["darkness state or placement", /\bdarkness\b/g],
  ["Bright Line copy", /bright[\s-]*line/gi],
  ["day/night copy", /day[\s/-]+night|night[\s/-]+day/gi],
  ["Dark Veil copy", /dark[\s-]*veil/gi],
];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function findMatches(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => ({
    index: match.index,
    match: match[0],
  }));
}

const failures = [];
const absence = [];
for (const relativePath of SOURCE_FILES) {
  const source = read(relativePath);
  for (const [name, pattern] of ABSENCE_CHECKS) {
    const matches = findMatches(source, pattern);
    if (matches.length) {
      absence.push({ file: relativePath, check: name, matches: matches.map((entry) => entry.match) });
      failures.push(`${relativePath}: ${name}`);
    }
  }
}

const retainedBrightReferences = [];
for (const [relativePath, references] of Object.entries(RETAINED_BRIGHT_REFERENCES)) {
  const source = read(relativePath);
  for (const reference of references) {
    if (!source.includes(reference)) {
      failures.push(`${relativePath}: missing retained reference ${reference}`);
      continue;
    }
    retainedBrightReferences.push({ file: relativePath, reference });
  }
}

const engineSource = read("js/sim/engine.js");
const neutralLiteral = /speed\s*:\s*1000\s*,\s*dmg\s*:\s*1000\s*,\s*armor\s*:\s*1000/;
const neutralPath = /function\s+effectiveBuff\s*\([^)]*\)\s*\{\s*return\s+[A-Z_]*(?:NEUTRAL|MULTIPLIER)[A-Z_]*\s*;\s*\}/s;
const neutralEngine = neutralLiteral.test(engineSource) && neutralPath.test(engineSource);
if (!neutralLiteral.test(engineSource)) failures.push("js/sim/engine.js: neutral speed/dmg/armor literal");
if (!neutralPath.test(engineSource)) failures.push("js/sim/engine.js: single neutral multiplier path");

const civs = CIV_IDS.map((id) => {
  const civ = getCiv(id);
  const registered = Boolean(civ);
  const hasLegacyBuffs = Boolean(civ && Object.prototype.hasOwnProperty.call(civ, "buffs"));
  if (!registered) failures.push(`civ registry: missing ${id}`);
  if (hasLegacyBuffs) failures.push(`civ registry: positional buffs remain on ${id}`);
  return {
    civ: id,
    registered,
    positionalBuffsAbsent: !hasLegacyBuffs,
    multipliers: NEUTRAL,
    neutral: registered && !hasLegacyBuffs && neutralEngine,
  };
});

const report = {
  engine: "fixed-day-neutral-audit",
  fixedDay: absence.length === 0,
  absence,
  retainedBrightReferences,
  civs,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(`Fixed-day audit failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
