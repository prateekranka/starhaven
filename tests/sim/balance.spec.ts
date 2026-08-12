import { describe, expect, it } from "vitest";
import { BALANCE_V1 } from "../../src/game/content/balance.v1";

describe("balance.v1", () => {
  it("locks the six-unit roster and exact build timings", () => {
    expect(BALANCE_V1.balanceVersion).toBe(1);
    expect(Object.keys(BALANCE_V1.units)).toEqual(["gleamrunner", "loomkeeper", "prismLancer", "stoneguard", "prospector", "riftCannon"]);
    expect(BALANCE_V1.units.gleamrunner).toMatchObject({ costMilliFlux: 70_000, buildTicks: 150, maxHealth: 125, damage: 11, cadenceTicks: 13 });
    expect(BALANCE_V1.units.loomkeeper).toMatchObject({ costMilliFlux: 95_000, buildTicks: 180, maxHealth: 155, damage: 7, cadenceTicks: 20 });
    expect(BALANCE_V1.units.prismLancer).toMatchObject({ costMilliFlux: 145_000, buildTicks: 260, maxHealth: 220, damage: 28, cadenceTicks: 24 });
    expect(BALANCE_V1.units.stoneguard).toMatchObject({ costMilliFlux: 75_000, buildTicks: 160, maxHealth: 180, damage: 15, cadenceTicks: 16 });
    expect(BALANCE_V1.units.prospector).toMatchObject({ costMilliFlux: 95_000, buildTicks: 180, maxHealth: 175, damage: 8, cadenceTicks: 20 });
    expect(BALANCE_V1.units.riftCannon).toMatchObject({ costMilliFlux: 150_000, buildTicks: 280, maxHealth: 235, damage: 34, cadenceTicks: 31, splashRadiusQ10: 1126, slowPercent: 20, slowTicks: 30 });
  });

  it("locks economy, capture, fracture, resonance, and timing values", () => {
    expect(BALANCE_V1.startingFluxMilli).toBe(260_000);
    expect(BALANCE_V1.baseIncomeMilliPerTick).toBe(125);
    expect(BALANCE_V1.capture.slotValues).toEqual([50_000, 17_500, 10_000]);
    expect(BALANCE_V1.capture.neutralOutpost).toBe(14_000_000);
    expect(BALANCE_V1.capture.neutralEngine).toBe(20_000_000);
    expect(BALANCE_V1.fracture).toMatchObject({ earliestSeconds: 255, randomSeconds: 30, telegraphTicks: 80 });
    expect(BALANCE_V1.resonance).toMatchObject({ victoryMilli: 275_000, calibrationTicks: 600, suddenDeathTick: 12_600 });
    expect(BALANCE_V1.match.finalTick).toBe(14_400);
    expect(BALANCE_V1.attack).toMatchObject({ damageTickOffset: 4, attackFrameDurationsMs: [100, 100, 100, 300] });
  });
});
