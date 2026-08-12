import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, requireArg } from "./artifact-lib.mjs";

try {
  const args = parseArgs(process.argv.slice(2));
  const url = requireArg(args, "url");
  const expectedFile = requireArg(args, "expected-file");
  const output = typeof args.output === "string" ? resolve(args.output) : null;
  const intervalSeconds = Number(args["interval-seconds"] ?? 30);
  const attempts = Number(args.attempts ?? 5);
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 0) throw new Error("--interval-seconds must be a non-negative integer");
  if (attempts !== 5) throw new Error("Pages propagation requires exactly five checks");
  const expectedSha = hash(readFileSync(expectedFile));
  const checks = [];
  for (let index = 0; index < attempts; index += 1) {
    if (index > 0 && intervalSeconds > 0) await wait(intervalSeconds * 1_000);
    const checkedUrl = `${url}${url.includes("?") ? "&" : "?"}starhaven-propagation=${index}`;
    try {
      const response = await fetch(checkedUrl, { cache: "no-store" });
      const bytes = Buffer.from(await response.arrayBuffer());
      checks.push({ index, url: checkedUrl, status: response.status, sha256: hash(bytes), matches: response.ok && hash(bytes) === expectedSha });
    } catch (error) {
      checks.push({ index, url: checkedUrl, status: null, sha256: null, matches: false, error: error.message });
    }
  }
  const report = { url, expectedSha, attempts, checks, valid: checks.at(-1)?.matches === true };
  if (output) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
