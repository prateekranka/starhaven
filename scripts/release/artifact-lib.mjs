import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

export const MANIFEST_FILE = "dist-hashes.json";
export const BUILD_INFO_FILE = "build-info.json";

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function collectFiles(root) {
  const absoluteRoot = resolve(root);
  if (!existsSync(absoluteRoot) || !statSync(absoluteRoot).isDirectory()) throw new Error(`artifact root is not a directory: ${absoluteRoot}`);
  const files = [];
  walk(absoluteRoot, absoluteRoot, files);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export function payloadFiles(root) {
  return collectFiles(root).filter(({ path }) => path !== MANIFEST_FILE && path !== BUILD_INFO_FILE);
}

export function hashFiles(root, includeBuildMetadata = true) {
  const files = includeBuildMetadata ? collectFiles(root) : payloadFiles(root);
  return files.map(({ path, absolutePath }) => {
    const bytes = readFileSync(absolutePath);
    return { path, bytes: bytes.length, sha256: sha256(bytes) };
  });
}

export function readJson(root, name) {
  const file = resolve(root, name);
  if (!existsSync(file)) throw new Error(`missing ${name}`);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`invalid ${name}: ${error.message}`);
  }
}

export function validateDist(root, expectedSourceSha = undefined) {
  const absoluteRoot = resolve(root);
  const buildInfo = readJson(absoluteRoot, BUILD_INFO_FILE);
  const manifest = readJson(absoluteRoot, MANIFEST_FILE);
  const manifestBytes = readFileSync(resolve(absoluteRoot, MANIFEST_FILE));
  const failures = [];

  if (manifest.schema !== 1) failures.push("manifest schema must be 1");
  if (!Array.isArray(manifest.files)) failures.push("manifest files must be an array");
  if (buildInfo.artifactSchema !== 1) failures.push("build-info artifactSchema must be 1");
  if (buildInfo.bridgeVersion !== 1) failures.push("build-info bridgeVersion must be 1");
  if (buildInfo.balanceVersion !== 1) failures.push("build-info balanceVersion must be 1");
  if (!/^[a-f0-9]{40}$/.test(buildInfo.sourceSha ?? "")) failures.push("build-info sourceSha must be a full SHA-1");
  if (!/^[a-f0-9]{9}(-dirty)?$/.test(buildInfo.displaySha ?? "")) failures.push("build-info displaySha is invalid");
  if (typeof buildInfo.clean !== "boolean") failures.push("build-info clean must be boolean");
  if (buildInfo.distManifestSha256 !== sha256(manifestBytes)) failures.push("build-info manifest hash does not match dist-hashes.json");
  if (expectedSourceSha !== undefined && buildInfo.sourceSha !== expectedSourceSha) failures.push(`source SHA mismatch: expected ${expectedSourceSha}, received ${buildInfo.sourceSha}`);
  if (buildInfo.clean && String(buildInfo.displaySha).endsWith("-dirty")) failures.push("clean build cannot have a dirty display SHA");

  const listed = Array.isArray(manifest.files) ? manifest.files : [];
  const listedPaths = new Set();
  for (const entry of listed) {
    if (!entry || typeof entry.path !== "string" || entry.path.length === 0 || entry.path.startsWith("/") || entry.path.includes("..") || entry.path.includes("\\")) {
      failures.push("manifest contains an unsafe path");
      continue;
    }
    if (entry.path === MANIFEST_FILE || entry.path === BUILD_INFO_FILE) failures.push(`manifest must not list ${entry.path}`);
    if (listedPaths.has(entry.path)) failures.push(`manifest contains duplicate path ${entry.path}`);
    listedPaths.add(entry.path);
    if (!Number.isInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? "")) failures.push(`manifest entry is invalid for ${entry.path}`);
  }

  const actualPayload = payloadFiles(absoluteRoot);
  const actualPaths = new Set(actualPayload.map(({ path }) => path));
  for (const path of listedPaths) if (!actualPaths.has(path)) failures.push(`manifest lists missing file ${path}`);
  for (const { path, absolutePath } of actualPayload) {
    const entry = listed.find((candidate) => candidate.path === path);
    const bytes = readFileSync(absolutePath);
    if (!entry) failures.push(`manifest omits file ${path}`);
    else if (entry.bytes !== bytes.length || entry.sha256 !== sha256(bytes)) failures.push(`manifest hash mismatch for ${path}`);
  }

  return { valid: failures.length === 0, failures, buildInfo, manifest, files: actualPayload };
}

export function assertValidDist(root, expectedSourceSha = undefined) {
  const report = validateDist(root, expectedSourceSha);
  if (!report.valid) throw new Error(report.failures.join("; "));
  return report;
}

export function compareArtifacts(leftRoot, rightRoot) {
  const left = collectFiles(leftRoot);
  const right = collectFiles(rightRoot);
  const leftPaths = new Set(left.map(({ path }) => path));
  const rightPaths = new Set(right.map(({ path }) => path));
  const paths = [...new Set([...leftPaths, ...rightPaths])].sort();
  const differences = [];
  for (const path of paths) {
    const leftFile = left.find((file) => file.path === path);
    const rightFile = right.find((file) => file.path === path);
    if (!leftFile || !rightFile) {
      differences.push({ path, reason: !leftFile ? "missing-left" : "missing-right" });
      continue;
    }
    const leftBytes = readFileSync(leftFile.absolutePath);
    const rightBytes = readFileSync(rightFile.absolutePath);
    if (!leftBytes.equals(rightBytes)) differences.push({ path, reason: "decoded-bytes-differ", leftSha256: sha256(leftBytes), rightSha256: sha256(rightBytes) });
  }
  return { equal: differences.length === 0, files: paths.length, differences };
}

export function copyArtifact(sourceRoot, targetRoot) {
  const source = resolve(sourceRoot);
  const target = resolve(targetRoot);
  if (existsSync(target)) throw new Error(`staging target already exists: ${target}`);
  mkdirSync(target, { recursive: true });
  for (const file of collectFiles(source)) {
    const destination = resolve(target, file.path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(file.absolutePath, destination);
  }
  return target;
}

export function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) values[key] = true;
    else {
      values[key] = value;
      index += 1;
    }
  }
  return values;
}

export function requireArg(args, name) {
  if (typeof args[name] !== "string" || args[name].length === 0) throw new Error(`missing --${name}`);
  return args[name];
}

function walk(root, current, files) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolutePath = resolve(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`artifact contains a symbolic link: ${absolutePath}`);
    if (entry.isDirectory()) walk(root, absolutePath, files);
    else if (entry.isFile()) {
      const path = relative(root, absolutePath).split(sep).join("/");
      files.push({ path, absolutePath });
    } else throw new Error(`artifact contains an unsupported entry: ${absolutePath}`);
  }
}
