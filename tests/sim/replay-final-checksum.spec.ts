import { describe, expect, it } from "vitest";
import { SkirmishMatch } from "../../src/game/sim/match";
import { q10FromWorld } from "../../src/game/sim/fixed";

describe("skirmish replay checksum", () => {
  it("keeps equal final checksums for equal seeds and ordered commands", () => {
    const left = new SkirmishMatch({ seed: 0x4d455249, playerFaction: "sunwoven", difficulty: "standard" });
    const right = new SkirmishMatch({ seed: 0x4d455249, playerFaction: "sunwoven", difficulty: "standard" });
    left.queueMove("sunwoven", [1, 2, 3], q10FromWorld(18), q10FromWorld(16));
    right.queueMove("sunwoven", [1, 2, 3], q10FromWorld(18), q10FromWorld(16));
    left.run(240);
    right.run(240);
    expect(left.checksum()).toBe(right.checksum());
    expect(new TextEncoder().encode(JSON.stringify(left.snapshot())).byteLength).toBeLessThan(64 * 1024);
  });
});
