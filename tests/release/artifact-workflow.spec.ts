import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(process.cwd());
const distRoot = resolve(repositoryRoot, "dist");
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();

describe("release artifact workflow", () => {
  it("validates the manifest anchor and exact decoded bytes", () => {
    const result = spawnSync(process.execPath, ["scripts/release/verify-release.mjs", "--dist", distRoot, "--source-sha", sourceSha], { cwd: repositoryRoot, encoding: "utf8" });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as { valid: boolean; files: number };
    expect(report.valid).toBe(true);
    expect(report.files).toBeGreaterThan(20);
  });

  it("rejects a wrong source SHA and a payload hash mismatch", () => {
    const wrongSha = spawnSync(process.execPath, ["scripts/release/verify-release.mjs", "--dist", distRoot, "--source-sha", "0000000000000000000000000000000000000000"], { cwd: repositoryRoot, encoding: "utf8" });
    expect(wrongSha.status).toBe(1);
    expect(`${wrongSha.stdout}${wrongSha.stderr}`).toContain("checked out SHA");

    const temporaryRoot = mkdtempSync(join(repositoryRoot, "release-test-"));
    try {
      cpSync(distRoot, temporaryRoot, { recursive: true });
      const indexPath = join(temporaryRoot, "index.html");
      writeFileSync(indexPath, `${readFileSync(indexPath, "utf8")}\n`);
      const infoPath = join(temporaryRoot, "build-info.json");
      const info = JSON.parse(readFileSync(infoPath, "utf8")) as Record<string, unknown>;
      info.clean = true;
      info.displaySha = sourceSha.slice(0, 9);
      writeFileSync(infoPath, `${JSON.stringify(info, null, 2)}\n`);
      const mismatched = spawnSync(process.execPath, ["scripts/release/stage-dist.mjs", "--source", temporaryRoot, "--target", join(temporaryRoot, "bad-stage"), "--expected-sha", sourceSha], { cwd: repositoryRoot, encoding: "utf8" });
      expect(mismatched.status).toBe(1);
      expect(`${mismatched.stdout}${mismatched.stderr}`).toContain("manifest hash mismatch for index.html");
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects dirty staging and accepts an exact byte clone after clean metadata", () => {
    const temporaryRoot = mkdtempSync(join(repositoryRoot, "release-test-"));
    const stagedRoot = join(temporaryRoot, "staged");
    try {
      const dirtyResult = spawnSync(process.execPath, ["scripts/release/stage-dist.mjs", "--source", distRoot, "--target", stagedRoot, "--expected-sha", sourceSha], { cwd: repositoryRoot, encoding: "utf8" });
      expect(dirtyResult.status).toBe(1);
      expect(`${dirtyResult.stdout}${dirtyResult.stderr}`).toContain("staging requires clean build-info");

      const cleanDist = join(temporaryRoot, "clean-dist");
      cpSync(distRoot, cleanDist, { recursive: true });
      const infoPath = join(cleanDist, "build-info.json");
      const info = JSON.parse(readFileSync(infoPath, "utf8")) as Record<string, unknown>;
      info.clean = true;
      info.displaySha = sourceSha.slice(0, 9);
      writeFileSync(infoPath, `${JSON.stringify(info, null, 2)}\n`);
      const stageResult = spawnSync(process.execPath, ["scripts/release/stage-dist.mjs", "--source", cleanDist, "--target", stagedRoot, "--expected-sha", sourceSha], { cwd: repositoryRoot, encoding: "utf8" });
      expect(stageResult.status).toBe(0);
      expect(existsSync(stagedRoot)).toBe(true);
      const verified = spawnSync(process.execPath, ["scripts/release/verify-staged-dist.mjs", "--source", cleanDist, "--staged", stagedRoot, "--expected-sha", sourceSha], { cwd: repositoryRoot, encoding: "utf8" });
      expect(verified.status).toBe(0);
      expect(JSON.parse(verified.stdout)).toMatchObject({ valid: true, equal: true });
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
