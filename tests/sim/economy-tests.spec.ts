import { describe, expect, it } from "vitest";
import { BALANCE_V1 } from "../../src/game/content/balance.v1";
import { SkirmishMatch } from "../../src/game/sim/match";
import { q10FromWorld } from "../../src/game/sim/fixed";

describe("economy and production", () => {
  it("starts both factions at the specified flux and population", () => {
    const match = new SkirmishMatch({ seed: 1, playerFaction: "sunwoven", difficulty: "standard" });
    const snapshot = match.snapshot();
    expect(snapshot.factions.sunwoven.fluxMilli).toBe(BALANCE_V1.startingFluxMilli);
    expect(snapshot.factions.gravemark.fluxMilli).toBe(BALANCE_V1.startingFluxMilli);
    expect(snapshot.factions.sunwoven.population).toBe(3);
    expect(snapshot.factions.gravemark.population).toBe(3);
  });

  it("deducts production cost, applies income, and completes at its tick", () => {
    const match = new SkirmishMatch({ seed: 2, playerFaction: "sunwoven", difficulty: "standard" });
    match.queueProduction("sunwoven", "gleamrunner");
    match.step();
    expect(match.snapshot().factions.sunwoven.fluxMilli).toBe(190_125);
    expect(match.snapshot().factions.sunwoven.production[0]?.readyTick).toBe(151);
    match.run(150);
    expect(match.snapshot().factions.sunwoven.production).toHaveLength(0);
    expect(match.snapshot().factions.sunwoven.population).toBe(4);
  });

  it("returns the exact half-cost refunds for incomplete construction", () => {
    const match = new SkirmishMatch({ seed: 3, playerFaction: "sunwoven", difficulty: "standard" });
    const before = match.snapshot().factions.sunwoven.fluxMilli;
    match.queueBuild("sunwoven", [2], "latticeField", q10FromWorld(10), q10FromWorld(10));
    match.step();
    const structureId = match.snapshot().structures[0]?.id;
    expect(structureId).toBe(1);
    expect(match.cancelStructure(structureId ?? -1)).toBe(42_500);
    expect(match.snapshot().factions.sunwoven.fluxMilli).toBe(before - 42_500 + 125);
  });
});
