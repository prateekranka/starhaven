import { describe, expect, it } from "vitest";
import { captureContributionMicro, createCaptureObjective, resolveCaptureTick } from "../../src/game/sim/capture";

describe("micro-point capture", () => {
  it("sorts by multiplier then entity ID and applies exact integer multipliers", () => {
    const contributors = [
      { entityId: 9, faction: "sunwoven" as const, individualMultiplierNumerator: 1, individualMultiplierDenominator: 1 },
      { entityId: 2, faction: "sunwoven" as const, individualMultiplierNumerator: 5, individualMultiplierDenominator: 4 },
      { entityId: 3, faction: "sunwoven" as const, individualMultiplierNumerator: 1, individualMultiplierDenominator: 1 },
      { entityId: 4, faction: "sunwoven" as const, individualMultiplierNumerator: 1, individualMultiplierDenominator: 1 },
    ];
    expect(captureContributionMicro(contributors, 0, false)).toBe(90_000);
    expect(captureContributionMicro(contributors.slice(0, 3), 1, false)).toBe(108_000);
    expect(captureContributionMicro(contributors.slice(0, 3), 0, true)).toBe(112_500);
  });

  it("freezes contested capture and gates Engine capture by faction supply", () => {
    const objective = createCaptureObjective("engine");
    const contested = resolveCaptureTick(objective, [{ entityId: 1, faction: "sunwoven" }, { entityId: 2, faction: "gravemark" }], { sunwoven: true, gravemark: true }, 0, false);
    expect(contested.contested).toBe(true);
    expect(contested.gainedMicro).toBe(0);
    const unsupplied = resolveCaptureTick(objective, [{ entityId: 1, faction: "gravemark" }], { sunwoven: true, gravemark: false }, 0, false);
    expect(unsupplied.gainedMicro).toBe(0);
    expect(unsupplied.state.progressMicro.gravemark).toBe(0);
  });

  it("claims a neutral outpost at the exact threshold", () => {
    let objective = createCaptureObjective("outpostNorth");
    for (let tick = 0; tick < 280; tick += 1) objective = resolveCaptureTick(objective, [{ entityId: 1, faction: "sunwoven" }], true, 0, false).state;
    expect(objective.owner).toBe("sunwoven");
    expect(objective.progressMicro.sunwoven).toBe(0);
  });
});
