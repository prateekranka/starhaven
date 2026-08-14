#!/usr/bin/env node
/**
 * Report pixel-mesa pack size against GameCache download budgets.
 */
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../..");
const PACK_DIRS = ["css", "js", "maps", "media", "vendor"];
const PACK_ROOT_FILES = ["cache-manifest.json", "index.html", "sw.js"];

const LIMITS = {
  totalBytes: 120 * 1024 * 1024,
  audioBytes: 20 * 1024 * 1024,
  civArtBytes: 15 * 1024 * 1024,
};
const WARN_RATIO = 0.9;

const civPatterns = {
  sunwoven: /(?:^|\/)media\/sprites\/(?:sheet-sunwoven|sheet-sun-|bldg-sun-|unit-sun-|portrait-sun|icon-(?:train|build|age)-sun|sun-(?:walk|guard|strider|siege))/,
  gravemark: /(?:^|\/)media\/sprites\/(?:sheet-gravemark|sheet-grave-|bldg-grave-|unit-grave-|portrait-grave|icon-(?:train|build|age)-grave|grave-(?:walk|guard|strider|siege))/,
  stormveil: /(?:^|\/)media\/sprites\/(?:sheet-stormveil|sheet-storm-|bldg-storm-|unit-storm-|portrait-storm|icon-(?:train|build|age)-storm|storm-(?:walk|guard|strider|siege|wagon))/,
  ashvein: /(?:^|\/)media\/sprites\/(?:sheet-ashvein|sheet-ash-|bldg-ash-|unit-ash-|portrait-ash|icon-(?:train|build|age)-ash|ash-(?:walk|guard|strider|siege))/,
  cogforged: /(?:^|\/)media\/sprites\/(?:sheet-cogforged|sheet-cog-|bldg-cog-|unit-cog-|portrait-cog|icon-(?:train|build|age)-cog|cog-(?:walk|guard|strider|siege))/,
};

function walkFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.isFile()) files.push(rel);
    }
  };
  for (const f of PACK_ROOT_FILES) files.push(f);
  for (const d of PACK_DIRS) walk(d);
  return files.sort();
}

function bytesOf(path) {
  return statSync(join(repoRoot, path)).size;
}

function fmt(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const files = walkFiles();
let total = 0;
let audio = 0;
const civ = Object.fromEntries(Object.keys(civPatterns).map((id) => [id, 0]));
const warnings = [];
const failures = [];

for (const path of files) {
  const b = bytesOf(path);
  total += b;
  if (path.startsWith("media/audio/") || /\.(mp3|ogg|wav|m4a|aac)$/i.test(path)) audio += b;
  for (const [civId, re] of Object.entries(civPatterns)) {
    if (re.test(path)) civ[civId] += b;
  }
}

function check(label, value, limit) {
  const warnAt = limit * WARN_RATIO;
  if (value > limit) failures.push(`${label} ${fmt(value)} exceeds limit ${fmt(limit)}`);
  else if (value > warnAt) warnings.push(`${label} ${fmt(value)} is above ${Math.round(WARN_RATIO * 100)}% of ${fmt(limit)}`);
}

check("Total pack", total, LIMITS.totalBytes);
check("Audio", audio, LIMITS.audioBytes);
for (const [civId, bytes] of Object.entries(civ)) {
  check(`${civId} art`, bytes, LIMITS.civArtBytes);
}

console.log(
  JSON.stringify(
    {
      ok: failures.length === 0,
      fileCount: files.length,
      totalBytes: total,
      totalLabel: fmt(total),
      audioBytes: audio,
      civArt: Object.fromEntries(
        Object.entries(civ).map(([id, bytes]) => [id, { bytes, label: fmt(bytes) }])
      ),
      limits: { total: fmt(LIMITS.totalBytes), audio: fmt(LIMITS.audioBytes), civArt: fmt(LIMITS.civArtBytes) },
      warnings,
      failures,
    },
    null,
    2
  )
);
if (failures.length) process.exitCode = 1;
