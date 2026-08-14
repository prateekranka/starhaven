#!/usr/bin/env node
/**
 * Report pixel-mesa pack size against GameCache download budgets.
 */
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../..");
const PACK_DIRS = ["css", "js", "media", "vendor"];
const PACK_ROOT_FILES = ["cache-manifest.json", "index.html", "sw.js"];

const LIMITS = {
  totalBytes: 120 * 1024 * 1024,
  audioBytes: 20 * 1024 * 1024,
  civArtBytes: 15 * 1024 * 1024,
};
const WARN_RATIO = 0.9;

const civPatterns = {
  sunwoven: /(?:^|\/)media\/sprites\/(?:sheet-sun|bldg-sun|unit-sun|portrait-sun|sun-guard)/,
  gravemark: /(?:^|\/)media\/sprites\/(?:sheet-grave|bldg-grave|unit-grave|portrait-grave|grave-guard)/,
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
const civ = { sunwoven: 0, gravemark: 0 };
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
check("Sunwoven art", civ.sunwoven, LIMITS.civArtBytes);
check("Gravemark art", civ.gravemark, LIMITS.civArtBytes);

console.log(
  JSON.stringify(
    {
      ok: failures.length === 0,
      fileCount: files.length,
      totalBytes: total,
      totalLabel: fmt(total),
      audioBytes: audio,
      civArt: {
        sunwoven: { bytes: civ.sunwoven, label: fmt(civ.sunwoven) },
        gravemark: { bytes: civ.gravemark, label: fmt(civ.gravemark) },
      },
      limits: { total: fmt(LIMITS.totalBytes), audio: fmt(LIMITS.audioBytes), civArt: fmt(LIMITS.civArtBytes) },
      warnings,
      failures,
    },
    null,
    2
  )
);
if (failures.length) process.exitCode = 1;
