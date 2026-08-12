import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertValidDist, copyArtifact, parseArgs, requireArg } from "./artifact-lib.mjs";

try {
  const args = parseArgs(process.argv.slice(2));
  const source = resolve(requireArg(args, "source"));
  const target = resolve(requireArg(args, "target"));
  const expectedSha = requireArg(args, "expected-sha");
  const inputList = resolve(requireArg(args, "input-list"));
  const attestation = typeof args.attestation === "string" ? resolve(args.attestation) : null;
  if (!/^[a-f0-9]{40}$/.test(expectedSha)) throw new Error("--expected-sha must be a full lowercase SHA-1");
  const report = assertValidDist(source, expectedSha);
  if (!report.buildInfo.clean) throw new Error("iOS staging requires clean build-info");
  const stagedRoot = copyArtifact(source, target);
  const repositoryRoot = resolve(import.meta.dirname, "../..");
  const inputPaths = [
    resolve(repositoryRoot, "scripts/release/verify-xcode-dist.sh"),
    resolve(repositoryRoot, "scripts/release/verify-staged-dist.mjs"),
    resolve(repositoryRoot, "scripts/release/artifact-lib.mjs"),
    resolve(repositoryRoot, "notes.md"),
    resolve(stagedRoot, "build-info.json"),
    resolve(stagedRoot, "dist-hashes.json"),
    ...(attestation ? [attestation] : []),
    ...report.files.map((file) => resolve(stagedRoot, file.path)),
  ];
  mkdirSync(resolve(inputList, ".."), { recursive: true });
  writeFileSync(inputList, `${inputPaths.map((path) => path.replace(`${repositoryRoot}/`, "$(PROJECT_DIR)/../")).join("\n")}\n`);
  console.log(JSON.stringify({ valid: true, source, target: stagedRoot, sourceSha: report.buildInfo.sourceSha, files: report.files.length, inputList }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
