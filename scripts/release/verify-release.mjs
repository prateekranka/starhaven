import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { assertValidDist, parseArgs, requireArg } from "./artifact-lib.mjs";

function git(args) {
  return execFileSync("git", args, { cwd: resolve(import.meta.dirname, "../.."), encoding: "utf8" }).trim();
}

try {
  const args = parseArgs(process.argv.slice(2));
  const dist = requireArg(args, "dist");
  const expectedSha = requireArg(args, "source-sha");
  if (!/^[a-f0-9]{40}$/.test(expectedSha)) throw new Error("--source-sha must be a full lowercase SHA-1");
  const expectedOrigin = typeof args.origin === "string" ? args.origin : "starhaven-bright-frontier";
  const currentSha = git(["rev-parse", "HEAD"]);
  if (currentSha !== expectedSha) throw new Error(`checked out SHA ${currentSha} does not match ${expectedSha}`);
  const origin = git(["remote", "get-url", "origin"]);
  if (!origin.includes(`/${expectedOrigin}.git`) && !origin.endsWith(`/${expectedOrigin}`)) throw new Error(`origin does not resolve to ${expectedOrigin}: ${origin}`);
  const dirtyPaths = git(["status", "--porcelain=v1", "--untracked-files=all"])
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .filter((file) => file !== ".DS_Store");
  if (args["require-clean"] && dirtyPaths.length > 0) throw new Error(`working tree is dirty: ${dirtyPaths.join(", ")}`);
  const report = assertValidDist(resolve(dist), expectedSha);
  if (args["require-clean"] && !report.buildInfo.clean) throw new Error("release requires clean build-info");
  console.log(JSON.stringify({ valid: true, origin, sourceSha: expectedSha, clean: report.buildInfo.clean, files: report.files.length }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
