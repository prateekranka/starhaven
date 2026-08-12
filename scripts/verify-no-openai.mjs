import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const roots = ["index.html", "package.json", "vite.config.ts", "src", "scripts", "dist"];
const files = roots.flatMap((root) => collect(resolve(repositoryRoot, root))).filter((file) => !file.endsWith("verify-no-openai.mjs"));
const findings = [];
const forbiddenPattern = /openai|api\.openai|gpt-image-2/i;

for (const file of files) {
  const text = readFileSync(file, "utf8").replaceAll("verify:no-openai", "").replaceAll("verify-no-openai.mjs", "");
  if (forbiddenPattern.test(text)) findings.push({ file: file.slice(repositoryRoot.length + 1), reason: "forbidden runtime integration marker" });
}

const report = { roots, files: files.length, findings, valid: findings.length === 0 };
console.log(JSON.stringify(report, null, 2));
if (findings.length > 0) process.exitCode = 1;

function collect(target) {
  if (!existsSync(target)) return [];
  if (statSync(target).isFile()) return [target];
  return readdirSync(target, { withFileTypes: true }).flatMap((entry) => collect(resolve(target, entry.name)));
}
