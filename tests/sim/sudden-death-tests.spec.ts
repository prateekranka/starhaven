import { describe, expect, it } from "vitest";
import { BALANCE_V1 } from "../../src/game/content/balance.v1";
import { SkirmishMatch } from "../../src/game/sim/match";

describe("Resonance supply and sudden death", () => {
  it("keeps Resonance paused without Engine supply and enables sudden death at 10:30", () => {
    const match = new SkirmishMatch({ seed: 9, playerFaction: "sunwoven", difficulty: "standard" });
    match.setObjectiveOwner("engine", "sunwoven");
    match.setCalibration("sunwoven", BALANCE_V1.resonance.calibrationTicks);
    match.run(2);
    expect(match.snapshot().factions.sunwoven.resonanceMilli).toBe(0);
    match.setObjectiveOwner("outpostNorth", "sunwoven");
    match.setCalibration("sunwoven", BALANCE_V1.resonance.calibrationTicks);
    match.step();
    expect(match.snapshot().factions.sunwoven.resonanceMilli).toBe(50);
    const late = new SkirmishMatch({ seed: 9, playerFaction: "sunwoven", difficulty: "standard" });
    late.run(BALANCE_V1.match.suddenDeathTick);
    expect(late.snapshot().suddenDeath).toBe(true);
  });

  it("scores a supplied Engine after sudden death calibration completes", () => {
    const match = new SkirmishMatch({ seed: 12, playerFaction: "sunwoven", difficulty: "standard" });
    match.setObjectiveOwner("outpostNorth", "sunwoven");
    match.run(BALANCE_V1.resonance.suddenDeathTick - 10);
    match.setObjectiveOwner("engine", "sunwoven");
    match.run(10);
    expect(match.snapshot().suddenDeath).toBe(true);
    match.setCalibration("sunwoven", BALANCE_V1.resonance.calibrationTicks);
    match.setResonance("sunwoven", BALANCE_V1.resonance.victoryMilli - 100);
    match.step();
    expect(match.ended?.reason).toBe("resonanceVictory");
  });

  it("keeps the accelerated browser timeline deterministic", () => {
    const match = new SkirmishMatch({ seed: 13, playerFaction: "sunwoven", difficulty: "standard" });
    for (let index = 0; index < 14_400 && !match.ended; index += 1) {
      match.step();
      if (match.tick === 1) match.setObjectiveOwner("outpostNorth", "sunwoven");
      if (match.tick === 4) { match.setObjectiveOwner("outpostSouth", "sunwoven"); match.forceFracture(); }
      if (match.tick === 12_590) match.setObjectiveOwner("engine", "sunwoven");
      if (match.tick === 12_600) { match.setCalibration("sunwoven", BALANCE_V1.resonance.calibrationTicks); match.setResonance("sunwoven", BALANCE_V1.resonance.victoryMilli - 100); }
    }
    expect(match.tick).toBe(12_601);
    expect(match.ended?.reason).toBe("resonanceVictory");
  });
});
