import { describe, expect, it } from "vitest";
import { BALANCE_V1 } from "../../src/game/content/balance.v1";
import { resolveAttackTick, startAttack, canStartStoneguardLunge, startStoneguardLunge } from "../../src/game/sim/combat";

describe("combat timing", () => {
  it("applies the first attack damage on tick 4 and labels frame three", () => {
    const attacker = { id: 1, faction: "sunwoven" as const, kind: "gleamrunner" as const, health: 125, maxHealth: 125, xQ10: 0, yQ10: 0 };
    const target = { id: 2, faction: "gravemark" as const, kind: "stoneguard" as const, health: 180, maxHealth: 180, xQ10: 0, yQ10: 0 };
    const attack = startAttack(attacker, target, 0);
    expect(resolveAttackTick(attack, attacker, [attacker, target], 3)).toBeNull();
    const damage = resolveAttackTick(attack, attacker, [attacker, target], BALANCE_V1.attack.damageTickOffset);
    expect(damage).toMatchObject({ tick: 4, damage: 11, attackFrame: 3 });
    expect(target.health).toBe(169);
    expect(BALANCE_V1.attack.attackFrameDurationsMs).toEqual([100, 100, 100, 300]);
  });

  it("supports Stoneguard Gravimetric Lunge only in its valid range and cooldown", () => {
    const attacker = { id: 1, faction: "gravemark" as const, kind: "stoneguard" as const, health: 180, maxHealth: 180, xQ10: 0, yQ10: 0 };
    const target = { id: 2, faction: "sunwoven" as const, kind: "gleamrunner" as const, health: 125, maxHealth: 125, xQ10: 2_048, yQ10: 0 };
    expect(canStartStoneguardLunge(attacker, target, 0, 0)).toBe(true);
    const lunge = startStoneguardLunge(attacker, target, 0, 0);
    expect(lunge.cooldownReadyTick).toBe(160);
    expect(canStartStoneguardLunge(attacker, target, 1, lunge.cooldownReadyTick)).toBe(false);
  });
});
