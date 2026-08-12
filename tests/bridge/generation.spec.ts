import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("bridge generation", () => {
  it("is idempotent", () => {
    const root = resolve(process.cwd());
    const target = resolve(root, "src/bridge/protocol.generated.ts");
    const before = readFileSync(target, "utf8");
    execFileSync("node", ["scripts/bridge/generate.mjs"], { cwd: root });
    expect(readFileSync(target, "utf8")).toBe(before);
  });
});
