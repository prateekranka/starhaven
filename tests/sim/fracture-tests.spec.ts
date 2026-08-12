import { describe, expect, it } from "vitest";
import { BALANCE_V1 } from "../../src/game/content/balance.v1";
import { q10FromWorld } from "../../src/game/sim/fixed";
import { SkirmishMatch } from "../../src/game/sim/match";

describe("seeded Meridian fracture", () => {
  it("selects a deterministic 255-285 second warning and opens after 80 ticks", () => {
    const first = new SkirmishMatch({ seed: 0x4d455249, playerFaction: "sunwoven", difficulty: "standard" });
    const second = new SkirmishMatch({ seed: 0x4d455249, playerFaction: "sunwoven", difficulty: "standard" });
    expect(first.snapshot().fractureWarningTick).toBe(second.snapshot().fractureWarningTick);
    expect(first.snapshot().fractureWarningTick).toBeGreaterThanOrEqual(255 * 20);
    expect(first.snapshot().fractureWarningTick).toBeLessThanOrEqual(285 * 20);
    first.forceFracture();
    const telegraph = first.step();
    expect(telegraph.some((event) => event.type === "fractureTelegraph")).toBe(true);
    first.run(BALANCE_V1.fracture.telegraphTicks - 1);
    expect(first.snapshot().fractureOpen).toBe(false);
    const collapse = first.step();
    expect(collapse.some((event) => event.type === "fractureOpened")).toBe(true);
    expect(first.snapshot().fractureOpen).toBe(true);
  });

  it("reroutes a unit near the Engine to an authored safe node without damage", () => {
    const match = new SkirmishMatch({ seed: 4, playerFaction: "sunwoven", difficulty: "standard" });
    const initialHealth = match.snapshot().units.find((unit) => unit.id === 1)?.health;
    match.forceFracture();
    match.queueMove("sunwoven", [1], q10FromWorld(24), q10FromWorld(16));
    match.run(BALANCE_V1.fracture.telegraphTicks + 1);
    const rerouted = match.snapshot().units.find((unit) => unit.id === 1);
    expect(rerouted?.targetXQ10).not.toBe(q10FromWorld(24));
    expect(rerouted?.health).toBe(initialHealth);
  });
});
