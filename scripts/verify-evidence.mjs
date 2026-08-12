import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const checkpointRoot = resolve(repositoryRoot, "evidence", "checkpoints");
const files = ["C01.json"];
const failures = [];

for (const file of files) {
  const filePath = resolve(checkpointRoot, file);
  if (!existsSync(filePath)) {
    failures.push(`${file}: missing checkpoint index`);
    continue;
  }
  let index;
  try {
    index = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    failures.push(`${file}: invalid JSON (${error.message})`);
    continue;
  }
  if (typeof index.evidenceDir !== "string" || !index.evidenceDir.startsWith("/")) {
    failures.push(`${file}: evidenceDir must be absolute`);
  }
  if (!Array.isArray(index.entries)) {
    failures.push(`${file}: entries must be an array`);
    continue;
  }
  for (const entry of index.entries) {
    if (typeof entry.path !== "string" || !entry.path.startsWith("/")) failures.push(`${file}: entry path is not absolute`);
    if (!Number.isInteger(entry.bytes) || entry.bytes < 0) failures.push(`${file}: invalid byte count`);
    if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) failures.push(`${file}: invalid SHA-256`);
    if (entry.path && existsSync(entry.path)) {
      const actual = readFileSync(entry.path);
      const actualHash = createHash("sha256").update(actual).digest("hex");
      if (actual.length !== entry.bytes || actualHash !== entry.sha256) failures.push(`${file}: hash mismatch for ${entry.path}`);
    }
  }
}

const report = { checkpointRoot, files, failures, valid: failures.length === 0 };
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;
