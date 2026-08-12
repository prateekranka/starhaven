import { describe, expect, it } from "vitest";
import { q10FromWorld } from "../../src/game/sim/fixed";
import { encodeReplay, decodeReplay } from "../../src/game/replay/codec";
import { replayToChecksums, ReplayRecorder } from "../../src/game/replay/replay";
import { Simulation } from "../../src/game/sim/simulation";

describe("replay boundary", () => {
  it("round-trips a command log and returns deterministic checksums", () => {
    const recorder = new ReplayRecorder(0x4d455249);
    const simulation = new Simulation({ seed: recorder.data.seed });
    const command = simulation.queueCommand({ issuer: "sunwoven", type: "move", entityIds: [1], targetXQ10: q10FromWorld(12), targetYQ10: q10FromWorld(16) });
    recorder.recordCommand(command);
    simulation.run(20);
    recorder.recordSnapshot(simulation.snapshot());
    const decoded = decodeReplay(encodeReplay(recorder.data));
    expect(replayToChecksums(decoded, 20)).toHaveLength(20);
    expect(decoded.commands[0]?.id).toBe(1);
  });
});
