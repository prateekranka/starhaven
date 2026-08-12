import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const evidenceDir = resolve(process.env.CHECKPOINT_DIR ?? "");
if (!evidenceDir || evidenceDir === resolve(".")) throw new Error("CHECKPOINT_DIR is required");
mkdirSync(evidenceDir, { recursive: true });

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = resolve(repositoryRoot, "dist");
const stagedRoot = resolve(repositoryRoot, "ios/Artifacts/GameDist");
const appRoot = resolve(process.env.STARHAVEN_APP_ROOT ?? "/Users/prateekranka/.codex/evidence/starhaven-c07/20260812T190557Z.lYjSeN/DerivedData-final-handoff/Build/Products/Debug-iphonesimulator/Starhaven.app/GameDist");
const pagesRoot = String(process.env.STARHAVEN_HOSTED_URL ?? "https://prateekranka.github.io/starhaven-bright-frontier/").replace(/\/$/, "");
const manifest = JSON.parse(readFileSync(join(sourceRoot, "dist-hashes.json"), "utf8"));

const localEntries = manifest.files.map((entry) => ({ path: entry.path, expectedBytes: entry.bytes, expectedSha256: entry.sha256, local: digest(readFileSync(join(sourceRoot, entry.path))), staged: digest(readFileSync(join(stagedRoot, entry.path))), app: digest(readFileSync(join(appRoot, entry.path))) }));
const pageEntries = [];
for (const entry of manifest.files) {
  const response = await fetch(`${pagesRoot}/${entry.path}`, { cache: "no-store" });
  const bytes = Buffer.from(await response.arrayBuffer());
  pageEntries.push({ path: entry.path, status: response.status, observed: digest(bytes), matches: response.ok && digest(bytes).sha256 === entry.sha256 && digest(bytes).bytes === entry.bytes });
}

const localBuildInfo = digest(readFileSync(join(sourceRoot, "build-info.json")));
const stagedBuildInfo = digest(readFileSync(join(stagedRoot, "build-info.json")));
const appBuildInfo = digest(readFileSync(join(appRoot, "build-info.json")));
const localBuildInfoBody = JSON.parse(readFileSync(join(sourceRoot, "build-info.json"), "utf8"));
const pageBuildResponse = await fetch(`${pagesRoot}/build-info.json`, { cache: "no-store" });
const pageBuildInfoBytes = Buffer.from(await pageBuildResponse.arrayBuffer());
const pageBuildInfoBody = pageBuildResponse.ok ? JSON.parse(pageBuildInfoBytes.toString("utf8")) : null;
const pageBuildInfo = { status: pageBuildResponse.status, observed: digest(pageBuildInfoBytes), matches: pageBuildResponse.ok && pageBuildInfoBody?.sourceSha === localBuildInfoBody.sourceSha && pageBuildInfoBody?.distManifestSha256 === localBuildInfoBody.distManifestSha256 && pageBuildInfoBody?.balanceVersion === localBuildInfoBody.balanceVersion };

const allEqual = localEntries.every((entry) => entry.staged.sha256 === entry.local.sha256 && entry.app.sha256 === entry.local.sha256 && entry.staged.bytes === entry.local.bytes && entry.app.bytes === entry.local.bytes);
const pagesEqual = pageEntries.every((entry) => entry.matches);
writeJson("final-pages-hashes.json", { schema: 1, url: pagesRoot, sourceSha: JSON.parse(readFileSync(join(sourceRoot, "build-info.json"), "utf8")).sourceSha, manifestSha256: digest(readFileSync(join(sourceRoot, "dist-hashes.json"))).sha256, entries: pageEntries, buildInfo: pageBuildInfo, valid: pagesEqual && pageBuildInfo.matches });
writeJson("final-artifact-hashes.json", { schema: 1, sourceSha: JSON.parse(readFileSync(join(sourceRoot, "build-info.json"), "utf8")).sourceSha, manifestSha256: digest(readFileSync(join(sourceRoot, "dist-hashes.json"))).sha256, fileCount: manifest.fileCount, totalBytes: manifest.totalBytes, localBuildInfo, stagedBuildInfo, sourceToStagedEqual: localEntries.every((entry) => entry.staged.sha256 === entry.local.sha256 && entry.staged.bytes === entry.local.bytes), valid: allEqual });
writeJson("final-app-hashes.json", { schema: 1, appRoot, fileCount: localEntries.length, appBuildInfo, entries: localEntries, sourceToAppEqual: localEntries.every((entry) => entry.app.sha256 === entry.local.sha256 && entry.app.bytes === entry.local.bytes), stagedToAppEqual: localEntries.every((entry) => entry.app.sha256 === entry.staged.sha256 && entry.app.bytes === entry.staged.bytes), valid: allEqual });
writeFileSync(join(evidenceDir, "final-bridge-events.ndjson"), readFileSync("/Users/prateekranka/.codex/evidence/starhaven-c07/20260812T190557Z.lYjSeN/bridge-events-contract.ndjson"));
writeFileSync(join(evidenceDir, "git-status.txt"), execFileSync("git", ["status", "--short"], { cwd: repositoryRoot }));

function digest(bytes) {
  return { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function writeJson(name, value) {
  writeFileSync(join(evidenceDir, name), `${JSON.stringify(value, null, 2)}\n`);
}
