import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, requireArg } from "./artifact-lib.mjs";

try {
  const args = parseArgs(process.argv.slice(2));
  const output = resolve(requireArg(args, "output"));
  const runId = requireNumeric(args["run-id"] ?? process.env.GITHUB_RUN_ID, "run-id");
  const artifactId = requireNumeric(args["artifact-id"] ?? process.env.GITHUB_ARTIFACT_ID, "artifact-id");
  const deploymentId = requireNumeric(args["deployment-id"] ?? process.env.GITHUB_DEPLOYMENT_ID, "deployment-id");
  const sourceSha = String(args[shaKey(args)] ?? process.env.GITHUB_SHA ?? "");
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("source SHA must be a full lowercase SHA-1");
  mkdirSync(output, { recursive: true });
  const metadata = {
    schema: 1,
    sourceSha,
    repository: String(args.repository ?? process.env.GITHUB_REPOSITORY ?? "starhaven-bright-frontier"),
    runId,
    artifactId,
    deploymentId,
    pageUrl: String(args["page-url"] ?? process.env.STARHAVEN_PAGE_URL ?? "https://prateekranka.github.io/starhaven-bright-frontier/"),
  };
  writeFileSync(resolve(output, "github-run.json"), `${JSON.stringify({ schema: 1, sourceSha, repository: metadata.repository, runId }, null, 2)}\n`);
  writeFileSync(resolve(output, "artifact-metadata.json"), `${JSON.stringify({ schema: 1, sourceSha, artifactName: `starhaven-dist-${sourceSha}`, artifactId, retentionDays: 90 }, null, 2)}\n`);
  writeFileSync(resolve(output, "deployment-metadata.json"), `${JSON.stringify({ schema: 1, sourceSha, deploymentId, pageUrl: metadata.pageUrl }, null, 2)}\n`);
  console.log(JSON.stringify({ valid: true, ...metadata }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

function requireNumeric(value, name) {
  if (!/^\d+$/.test(String(value ?? ""))) throw new Error(`${name} must be numeric`);
  return Number(value);
}

function shaKey(args) {
  return Object.prototype.hasOwnProperty.call(args, "source-sha") ? "source-sha" : "sha";
}
