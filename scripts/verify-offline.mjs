import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const roots = ["index.html", "vite.config.ts", "src", "public"];
const files = roots.flatMap((root) => collect(resolve(repositoryRoot, root)));
const findings = [];
const originPattern = /https?:\/\//i;

for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (originPattern.test(text)) findings.push({ file: file.slice(repositoryRoot.length + 1), reason: "cross-origin URL" });
}

const report = { roots, files: files.length, findings, valid: findings.length === 0 };
console.log(JSON.stringify(report, null, 2));
if (findings.length > 0) process.exitCode = 1;

function collect(target) {
  if (!existsSync(target)) return [];
  if (statSync(target).isFile()) return [target];
  return readdirSync(target, { withFileTypes: true }).flatMap((entry) => collect(resolve(target, entry.name)));
}
