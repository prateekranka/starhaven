#!/usr/bin/env node
/** CI gate: ban non-deterministic Math helpers in js/sim/. */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const simDir = join(root, "js/sim");
const banned = [
  { name: "Math.random", re: /\bMath\.random\b/ },
  { name: "Math.sin", re: /\bMath\.sin\b/ },
  { name: "Math.cos", re: /\bMath\.cos\b/ },
  { name: "Math.atan2", re: /\bMath\.atan2\b/ },
  { name: "Math.hypot", re: /\bMath\.hypot\b/ },
];

const files = readdirSync(simDir).filter((f) => f.endsWith(".js"));
const violations = [];

for (const file of files) {
  const path = join(simDir, file);
  const lines = readFileSync(path, "utf8").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    for (const rule of banned) {
      if (rule.re.test(lines[i])) {
        violations.push({ file: `js/sim/${file}`, line: i + 1, rule: rule.name, text: lines[i].trim() });
      }
    }
  }
}

const report = { simLint: "pass", files: files.length, violations };
if (violations.length) {
  report.simLint = "fail";
  report.violations = violations;
}

console.log(JSON.stringify(report, null, 2));
process.exit(violations.length ? 1 : 0);
