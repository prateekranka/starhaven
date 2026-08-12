import { describe, expect, it } from "vitest";
import { BALANCE_V1 } from "../../src/game/content/balance.v1";
import { resolveMatchEnd } from "../../src/game/sim/victory";

const stats = (faction: "sunwoven" | "gravemark", overrides = {}) => ({ faction, resonanceMilli: 0, ownedOutposts: 0, headquartersHealth: 100, headquartersMaxHealth: 100, survivingUnitHealth: 100, finalPriority: faction === "sunwoven" ? 1 : 0, ...overrides });

describe("victory and time resolution", () => {
  it("resolves headquarters destruction and resonance victory", () => {
    expect(resolveMatchEnd(stats("sunwoven"), stats("gravemark"), 40, "abc", 1, "sunwoven")?.winner).toBe("sunwoven");
    expect(resolveMatchEnd(stats("sunwoven", { resonanceMilli: BALANCE_V1.resonance.victoryMilli }), stats("gravemark"), 700, "abc", 1)?.reason).toBe("resonanceVictory");
  });

  it("counts exactly 12:00 as a completed deterministic match", () => {
    const result = resolveMatchEnd(stats("sunwoven"), stats("gravemark"), BALANCE_V1.match.finalTick, "deadbeef", 0x4d455249);
    expect(result).toMatchObject({ reason: "timeLimit", finalTick: 14_400, durationSeconds: 720, finalChecksum: "deadbeef" });
    expect(result?.winner).toBe("sunwoven");
  });
});
