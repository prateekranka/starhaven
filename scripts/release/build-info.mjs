import { execFileSync } from "node:child_process";
import { createHash as createSha256 } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const distRoot = resolve(repositoryRoot, "dist");

function git(args) {
  return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

const sourceSha = git(["rev-parse", "HEAD"]);
const shortSha = sourceSha.slice(0, 9);
const dirtyPaths = git(["status", "--porcelain=v1", "--untracked-files=all"])
  .split("\n")
  .map((line) => line.slice(3).trim())
  .filter(Boolean)
  .filter((file) => file !== ".DS_Store");
const clean = dirtyPaths.length === 0;
const manifestPath = resolve(distRoot, "dist-hashes.json");
const manifestSha256 = readFileIfPresent(manifestPath);
const commitTimestamp = git(["show", "-s", "--format=%cI", "HEAD"]);

const buildInfo = {
  artifactSchema: 1,
  bridgeVersion: 1,
  balanceVersion: 0,
  sourceSha,
  displaySha: clean ? shortSha : `${shortSha}-dirty`,
  clean,
  commitTimestamp,
  nodeMajor: Number(process.versions.node.split(".")[0]),
  viteMajor: 7,
  generatedAt: new Date().toISOString(),
  distManifestSha256: manifestSha256,
};

mkdirSync(dirname(resolve(distRoot, "build-info.json")), { recursive: true });
writeFileSync(resolve(distRoot, "build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);
console.log(JSON.stringify(buildInfo));

function readFileIfPresent(file) {
  try {
    return sha256(readFileSync(file));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function sha256(bytes) {
  return createSha256("sha256").update(bytes).digest("hex");
}
