import { resolve } from "node:path";
import { assertValidDist, compareArtifacts, parseArgs, requireArg } from "./artifact-lib.mjs";

try {
  const args = parseArgs(process.argv.slice(2));
  const source = requireArg(args, "source");
  const staged = requireArg(args, "staged");
  const expectedSha = requireArg(args, "expected-sha");
  const sourceReport = assertValidDist(resolve(source), expectedSha);
  const stagedReport = assertValidDist(resolve(staged), expectedSha);
  if (!stagedReport.buildInfo.clean) throw new Error("staged build-info must be clean");
  const comparison = compareArtifacts(source, staged);
  if (!comparison.equal) throw new Error(`staged decoded bytes differ: ${JSON.stringify(comparison.differences)}`);
  console.log(JSON.stringify({ valid: true, sourceSha: sourceReport.buildInfo.sourceSha, files: comparison.files, equal: comparison.equal }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
