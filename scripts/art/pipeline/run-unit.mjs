#!/usr/bin/env node
/**
 * Regenerate one pipeline unit atlas end-to-end.
 *
 * Usage:
 *   node scripts/art/pipeline/run-unit.mjs --unit sun-guard --faction sunwoven --clips walk,attack,death
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { cleanupTree } from "./lib/cleanup.mjs";
import { loadPalette, loadPipelineConfig, loadUnitSources, repoPath } from "./lib/config.mjs";
import { generateUnitSources } from "./lib/generate.mjs";
import { packUnitAtlas } from "./lib/pack-atlas.mjs";

const args = parseArgs(process.argv.slice(2));
const unitId = args.unit || "sun-guard";
const faction = args.faction || "sunwoven";
const clips = (args.clips || "walk,attack,gather,build,death").split(",").map((s) => s.trim());

if (sharp.versions.vips !== "8.17.1") {
  console.warn(`warning: libvips ${sharp.versions.vips} (expected 8.17.1 for hash-stable atlases)`);
}

const { spec, inbetweening, root } = loadPipelineConfig();
const palette = loadPalette(faction);
const sources = loadUnitSources(unitId);
const sourceRoot = join(root, "assets", "source");
const atlasPath = repoPath("media", "sprites", `${unitId}.atlas.png`);
const metaPath = repoPath("media", "sprites", `${unitId}.atlas.json`);
const provenanceDir = repoPath("assets", "provenance", "units");
mkdirSync(provenanceDir, { recursive: true });

console.log(`generating sources for ${unitId} (${faction}) clips=${clips.join(",")}`);
const records = await generateUnitSources({ unitId, faction, clips, sourceRoot, sources });
const painted = faction === "cogforged" || faction === "ashvein" || faction === "stormveil";
if (painted) {
  console.log("skipping palette lock (painted true-cycle sheets)");
} else {
  await cleanupTree(records, palette);
}

console.log("packing atlas…");
const meta = await packUnitAtlas({ unitId, faction, clips, spec, inbetweening, sourceRoot, atlasPath, metaPath });

const provenance = {
  unitId,
  faction,
  clips,
  atlas: meta.path,
  sha256: meta.sha256,
  bytes: meta.bytes,
  sourceCount: records.length,
  generator: spec.hashStable.generator,
  libvips: sharp.versions.vips,
};
writeFileSync(join(provenanceDir, `${unitId}.json`), `${JSON.stringify(provenance, null, 2)}\n`);

console.log(JSON.stringify({ ok: true, unitId, atlas: meta.path, sha256: meta.sha256, bytes: meta.bytes, frames: meta.frames.length }, null, 2));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i += 1;
      } else out[key] = true;
    }
  }
  return out;
}
