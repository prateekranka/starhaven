import { resolve } from "node:path";
import { assertValidDist, copyArtifact, parseArgs, requireArg } from "./artifact-lib.mjs";

try {
  const args = parseArgs(process.argv.slice(2));
  const source = requireArg(args, "source");
  const target = requireArg(args, "target");
  const expectedSha = requireArg(args, "expected-sha");
  if (!/^[a-f0-9]{40}$/.test(expectedSha)) throw new Error("--expected-sha must be a full lowercase SHA-1");
  const report = assertValidDist(resolve(source), expectedSha);
  if (!report.buildInfo.clean) throw new Error("staging requires clean build-info");
  const targetRoot = copyArtifact(source, target);
  console.log(JSON.stringify({ valid: true, source: resolve(source), target: targetRoot, sourceSha: report.buildInfo.sourceSha, files: report.files.length }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
