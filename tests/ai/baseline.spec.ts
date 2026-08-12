import { describe, expect, it } from "vitest";
import { AI_DIFFICULTY, armyValueMilliFlux, chooseAiState, chooseOpening, openingUnit, shouldEvaluateAi } from "../../src/game/ai/baseline";
import { SkirmishMatch } from "../../src/game/sim/match";

describe("baseline AI", () => {
  it("uses HP-weighted army value and stable seeded openings", () => {
    const match = new SkirmishMatch({ seed: 0x4d455249, playerFaction: "sunwoven", difficulty: "standard" });
    const snapshot = match.snapshot();
    expect(armyValueMilliFlux(snapshot.units, "sunwoven")).toBe(260_000);
    expect(chooseOpening(1)).toBe(chooseOpening(1));
    expect(openingUnit("balanced", 0)).toBe("gleamrunner");
  });

  it("selects emergency defense before opening and uses difficulty intervals", () => {
    const match = new SkirmishMatch({ seed: 1, playerFaction: "sunwoven", difficulty: "standard" });
    match.setHeadquartersHealth("gravemark", 700);
    const snapshot = match.snapshot();
    expect(chooseAiState(snapshot, "gravemark").state).toBe("EmergencyDefend");
    expect(shouldEvaluateAi(10, "standard")).toBe(true);
    expect(shouldEvaluateAi(5, "explorer")).toBe(false);
    expect(AI_DIFFICULTY.vanguard.delayTicks).toBe(0);
  });
});
