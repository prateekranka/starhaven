import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { q10FromWorld } from "../../src/game/sim/fixed";
import { Simulation } from "../../src/game/sim/simulation";

describe("foundation evidence", () => {
  it("emits deterministic and PRNG reports when an evidence directory is supplied", () => {
    const left = new Simulation({ seed: 0x4d455249 });
    const right = new Simulation({ seed: 0x4d455249 });
    const command = { issuer: "sunwoven" as const, type: "move" as const, entityIds: [1, 2, 3], targetXQ10: q10FromWorld(20), targetYQ10: q10FromWorld(16) };
    left.queueCommand(command);
    right.queueCommand(command);
    left.run(240);
    right.run(240);
    const directory = process.env.CHECKPOINT_DIR;
    if (directory) {
      writeFileSync(join(directory, "determinism-v8.json"), `${JSON.stringify({ engine: "Node V8", seed: left.seed, ticks: left.tick, leftChecksum: left.checksum(), rightChecksum: right.checksum(), equal: left.checksum() === right.checksum() }, null, 2)}\n`);
      writeFileSync(join(directory, "prng-cursor-snapshot.json"), `${JSON.stringify({ seed: left.seed, streams: left.snapshot().prng }, null, 2)}\n`);
    }
    expect(left.checksum()).toBe(right.checksum());
  });
});
