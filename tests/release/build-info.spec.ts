import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("release build identity", () => {
  it("writes the required source identity fields", () => {
    const file = resolve(process.cwd(), "dist", "build-info.json");
    expect(existsSync(file)).toBe(true);
    const info = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    expect(info.sourceSha).toMatch(/^[a-f0-9]{40}$/);
    expect(info.displaySha).toMatch(/^[a-f0-9]{9}(-dirty)?$/);
    expect(typeof info.clean).toBe("boolean");
    expect(info.bridgeVersion).toBe(1);
  });
});
