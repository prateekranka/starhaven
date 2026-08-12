import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const roots = ["index.html", "vite.config.ts", "package.json", "src", "public", "dist"];
const files = roots.flatMap((root) => collect(resolve(repositoryRoot, root)));
const findings = [];
const originPattern = /https?:\/\/[^\s"'`]+/gi;
const harmlessNamespaces = new Set(["http://www.w3.org/1999/xhtml", "http://www.w3.org/2000/svg"]);

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const matches = text.match(originPattern) ?? [];
  const networkUrls = matches.filter((match) => !harmlessNamespaces.has(match.replace(/[),.;]+$/, "")));
  if (networkUrls.length > 0) findings.push({ file: file.slice(repositoryRoot.length + 1), reason: "cross-origin URL", matches: networkUrls });
}

const report = { roots, files: files.length, findings, valid: findings.length === 0 };
console.log(JSON.stringify(report, null, 2));
if (findings.length > 0) process.exitCode = 1;

function collect(target) {
  if (!existsSync(target)) return [];
  if (statSync(target).isFile()) return [target];
  return readdirSync(target, { withFileTypes: true }).flatMap((entry) => collect(resolve(target, entry.name)));
}
