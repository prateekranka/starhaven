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
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../..");
const PACK_ROOT_FILES = ["cache-manifest.json", "index.html", "sw.js"];
const PACK_DIRS = ["css", "js", "media", "vendor"];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();

function payloadPaths() {
  const paths = [...PACK_ROOT_FILES];
  const walk = (dir) => {
    for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`pack contains a symbolic link: ${rel}`);
      if (entry.isDirectory()) walk(rel);
      else if (entry.isFile()) paths.push(rel.split(sep).join("/"));
      else throw new Error(`pack contains an unsupported entry: ${rel}`);
    }
  };
  for (const dir of PACK_DIRS) walk(dir);
  return paths.sort((a, b) => a.localeCompare(b));
}

const files = payloadPaths().map((path) => {
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

const isPayload = (path) => PACK_ROOT_FILES.includes(path) || PACK_DIRS.some((dir) => path.startsWith(`${dir}/`));
const dirtyPayload = git(["status", "--porcelain=v1", "--untracked-files=all"])
  .split("\n")
  .map((line) => line.slice(3).trim())
  .filter(Boolean)
  .filter(isPayload);
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
