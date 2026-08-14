/*
 * Regenerates the static pixel-mesa pack manifests at the repo root (dev branch):
 *   dist-hashes.json  path+bytes+sha256 for every deployed pack file
 *   build-info.json   source identity + sha256 of dist-hashes.json
 * Run after any change to pack files, before committing:
 *   node scripts/release/pack-manifests.mjs
 * The iPad GameCache refuses packs whose bytes do not match these manifests.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { listPackFiles, isPackPath } from "./pack-layout.mjs";

const repoRoot = resolve(import.meta.dirname, "../..");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();

const paths = listPackFiles(repoRoot);

const SW_IMPORTS = ["js/cache/offline-shared.js"];
for (const required of SW_IMPORTS) {
  if (!paths.includes(required)) throw new Error(`pack is missing a service-worker import: ${required}`);
}

const files = paths.map((path) => {
  const bytes = readFileSync(join(repoRoot, path));
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
});
const manifest = {
  schema: 1,
  files,
  fileCount: files.length,
  totalBytes: files.reduce((total, file) => total + file.bytes, 0),
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(join(repoRoot, "dist-hashes.json"), manifestText);

const dirtyPayload = git(["status", "--porcelain=v1", "--untracked-files=all"])
  .split("\n")
  .map((line) => line.slice(3).trim())
  .filter(Boolean)
  .filter(isPackPath);
const clean = dirtyPayload.length === 0;
const sourceSha = git(["rev-parse", "HEAD"]);
const shortSha = sourceSha.slice(0, 9);

const buildInfo = {
  artifactSchema: 1,
  bridgeVersion: 1,
  balanceVersion: 1,
  sourceSha,
  displaySha: clean ? shortSha : `${shortSha}-dirty`,
  clean,
  generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  distManifestSha256: sha256(Buffer.from(manifestText)),
  pack: "pixel-mesa",
};
writeFileSync(join(repoRoot, "build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);
console.log(JSON.stringify({ ...buildInfo, fileCount: manifest.fileCount, totalBytes: manifest.totalBytes, dirtyPayload }));
