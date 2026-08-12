import { describe, expect, it } from "vitest";
import { q10FromWorld } from "../../src/game/sim/fixed";
import { Simulation } from "../../src/game/sim/simulation";

describe("fixed-step foundation", () => {
  it("spawns symmetric three-unit starts for both factions", () => {
    const simulation = new Simulation({ seed: 0x4d455249 });
    const snapshot = simulation.readState();
    expect(snapshot.units).toHaveLength(6);
    expect(snapshot.factions.sunwoven.unitIds).toHaveLength(3);
    expect(snapshot.factions.gravemark.unitIds).toHaveLength(3);
    expect(snapshot.units.filter((unit) => unit.faction === "sunwoven").map((unit) => unit.yQ10)).toEqual(snapshot.units.filter((unit) => unit.faction === "gravemark").map((unit) => unit.yQ10));
  });

  it("applies commands at currentTick plus one and moves with integer state", () => {
    const simulation = new Simulation({ seed: 7 });
    simulation.queueCommand({ issuer: "sunwoven", type: "move", entityIds: [1], targetXQ10: q10FromWorld(16), targetYQ10: q10FromWorld(16) });
    expect(simulation.tick).toBe(0);
    expect(simulation.step()).toEqual([{ type: "commandApplied", tick: 1, commandId: 1 }]);
    simulation.run(120);
    const unit = simulation.readState().units.find((candidate) => candidate.id === 1);
    expect(unit?.xQ10).toBeGreaterThan(q10FromWorld(5));
    expect(Number.isInteger(unit?.xQ10)).toBe(true);
    expect(simulation.readState().tick).toBe(121);
  });

  it("keeps identical replay checksums for identical command streams", () => {
    const left = new Simulation({ seed: 0x4d455249 });
    const right = new Simulation({ seed: 0x4d455249 });
    const command = { issuer: "sunwoven" as const, type: "move" as const, entityIds: [1, 2, 3], targetXQ10: q10FromWorld(20), targetYQ10: q10FromWorld(16) };
    left.queueCommand(command);
    right.queueCommand(command);
    left.run(240);
    right.run(240);
    expect(left.checksum()).toBe(right.checksum());
    expect(new TextEncoder().encode(JSON.stringify(left.snapshot())).byteLength).toBeLessThan(64 * 1024);
  });
});
