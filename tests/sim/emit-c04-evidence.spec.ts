import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BALANCE_V1 } from "../../src/game/content/balance.v1";
import { captureContributionMicro, createCaptureObjective, resolveCaptureTick } from "../../src/game/sim/capture";
import { resolveAttackTick, startAttack } from "../../src/game/sim/combat";
import { q10FromWorld } from "../../src/game/sim/fixed";
import { SkirmishMatch } from "../../src/game/sim/match";
import { resolveMatchEnd } from "../../src/game/sim/victory";

describe("C4 evidence reports", () => {
  it("emits the durable vertical-slice scenario reports", () => {
    const directory = process.env.CHECKPOINT_DIR;
    if (!directory) return;
    const write = (name: string, value: unknown): void => writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n");

    const economyMatch = new SkirmishMatch({ seed: 0x45434f4e, playerFaction: "sunwoven", difficulty: "standard" });
    const economyStart = economyMatch.snapshot();
    economyMatch.queueProduction("sunwoven", "gleamrunner");
    economyMatch.step();
    const economyQueued = economyMatch.snapshot();
    economyMatch.run(150);
    write("economy-tests.json", {
      balanceVersion: BALANCE_V1.balanceVersion,
      startingFluxMilli: economyStart.factions.sunwoven.fluxMilli,
      startingPopulation: economyStart.factions.sunwoven.population,
      queuedFluxMilli: economyQueued.factions.sunwoven.fluxMilli,
      readyTick: economyQueued.factions.sunwoven.production[0]?.readyTick,
      completedPopulation: economyMatch.snapshot().factions.sunwoven.population,
      baseIncomeMilliPerTick: BALANCE_V1.baseIncomeMilliPerTick,
      outpostIncomeMilliPerTick: BALANCE_V1.outpostIncomeMilliPerTick,
    });

    const captureContributors = [
      { entityId: 9, faction: "sunwoven" as const },
      { entityId: 2, faction: "sunwoven" as const, individualMultiplierNumerator: 5, individualMultiplierDenominator: 4 },
      { entityId: 3, faction: "sunwoven" as const },
    ];
    const captureObjective = createCaptureObjective("engine");
    const captureResult = resolveCaptureTick(captureObjective, captureContributors, { sunwoven: true, gravemark: false }, 1, true);
    write("capture-tests.json", {
      slotContributionMicro: captureContributionMicro(captureContributors, 1, true),
      engineThresholdMicro: BALANCE_V1.capture.neutralEngine,
      unsuppliedFactionContributionMicro: resolveCaptureTick(captureObjective, [{ entityId: 1, faction: "gravemark" }], { sunwoven: true, gravemark: false }, 0, false).gainedMicro,
      contestedContributionMicro: resolveCaptureTick(captureObjective, [{ entityId: 1, faction: "sunwoven" }, { entityId: 2, faction: "gravemark" }], { sunwoven: true, gravemark: true }, 0, false).gainedMicro,
      suddenDeathResult: captureResult,
    });

    const attacker = { id: 1, faction: "sunwoven" as const, kind: "gleamrunner" as const, health: 125, maxHealth: 125, xQ10: 0, yQ10: 0 };
    const target = { id: 2, faction: "gravemark" as const, kind: "stoneguard" as const, health: 180, maxHealth: 180, xQ10: 0, yQ10: 0 };
    const attack = startAttack(attacker, target, 0);
    resolveAttackTick(attack, attacker, [attacker, target], 3);
    const damage = resolveAttackTick(attack, attacker, [attacker, target], BALANCE_V1.attack.damageTickOffset);
    write("combat-tests.json", { damageTick: damage?.tick, attackFrame: damage?.attackFrame, damage: damage?.damage, targetHealthAfterHit: target.health, attackFrameDurationsMs: BALANCE_V1.attack.attackFrameDurationsMs });

    const fractureMatch = new SkirmishMatch({ seed: 0x46524143, playerFaction: "sunwoven", difficulty: "standard" });
    fractureMatch.forceFracture();
    const telegraph = fractureMatch.step();
    fractureMatch.run(BALANCE_V1.fracture.telegraphTicks - 1);
    const collapse = fractureMatch.step();
    const rerouteMatch = new SkirmishMatch({ seed: 0x46524143, playerFaction: "sunwoven", difficulty: "standard" });
    const rerouteHealth = rerouteMatch.snapshot().units.find((unit) => unit.id === 1)?.health;
    rerouteMatch.forceFracture();
    rerouteMatch.queueMove("sunwoven", [1], q10FromWorld(24), q10FromWorld(16));
    rerouteMatch.run(BALANCE_V1.fracture.telegraphTicks + 1);
    const reroutedUnit = rerouteMatch.snapshot().units.find((unit) => unit.id === 1);
    write("fracture-tests.json", {
      warningTick: fractureMatch.snapshot().fractureWarningTick,
      collapseTick: fractureMatch.snapshot().fractureCollapseTick,
      telegraphEvent: telegraph.some((event) => event.type === "fractureTelegraph"),
      openedEvent: collapse.some((event) => event.type === "fractureOpened"),
      open: fractureMatch.snapshot().fractureOpen,
      telegraphTicks: BALANCE_V1.fracture.telegraphTicks,
      reroutedUnitTargetXQ10: reroutedUnit?.targetXQ10,
      reroutedUnitTargetYQ10: reroutedUnit?.targetYQ10,
      reroutedUnitHealthUnchanged: reroutedUnit?.health === rerouteHealth,
    });

    const exactMatch = new SkirmishMatch({ seed: 0x54494d45, playerFaction: "sunwoven", difficulty: "standard" });
    exactMatch.run(BALANCE_V1.match.finalTick);
    const exactResult = exactMatch.ended;
    const directResult = resolveMatchEnd(
      { faction: "sunwoven", resonanceMilli: 0, ownedOutposts: 0, headquartersHealth: 100, headquartersMaxHealth: 100, survivingUnitHealth: 100, finalPriority: 1 },
      { faction: "gravemark", resonanceMilli: 0, ownedOutposts: 0, headquartersHealth: 100, headquartersMaxHealth: 100, survivingUnitHealth: 100, finalPriority: 0 },
      BALANCE_V1.match.finalTick,
      "deadbeef",
      0x54494d45,
    );
    write("victory-tests.json", { exactMatch: exactResult, directTimeLimitResult: directResult, finalTick: BALANCE_V1.match.finalTick, durationSeconds: BALANCE_V1.match.finalTick / BALANCE_V1.tickHz });

    const suddenMatch = new SkirmishMatch({ seed: 0x534444, playerFaction: "sunwoven", difficulty: "standard" });
    suddenMatch.setObjectiveOwner("outpostNorth", "sunwoven");
    suddenMatch.run(BALANCE_V1.resonance.suddenDeathTick - 10);
    suddenMatch.setObjectiveOwner("engine", "sunwoven");
    suddenMatch.run(10);
    suddenMatch.setCalibration("sunwoven", BALANCE_V1.resonance.calibrationTicks);
    suddenMatch.setResonance("sunwoven", BALANCE_V1.resonance.victoryMilli - 100);
    suddenMatch.step();
    write("sudden-death-tests.json", {
      suddenDeathTick: BALANCE_V1.resonance.suddenDeathTick,
      suddenDeath: suddenMatch.snapshot().suddenDeath,
      engineOwner: suddenMatch.snapshot().engine.owner,
      calibrationTicks: suddenMatch.snapshot().factions.sunwoven.calibrationTicks,
      resonanceMilli: suddenMatch.snapshot().factions.sunwoven.resonanceMilli,
      result: suddenMatch.ended,
    });

    const left = new SkirmishMatch({ seed: 0x5245504c, playerFaction: "sunwoven", difficulty: "standard" });
    const right = new SkirmishMatch({ seed: 0x5245504c, playerFaction: "sunwoven", difficulty: "standard" });
    const command = { faction: "sunwoven" as const, entityIds: [1, 2, 3], targetXQ10: q10FromWorld(18), targetYQ10: q10FromWorld(16) };
    left.queueMove(command.faction, command.entityIds, command.targetXQ10, command.targetYQ10);
    right.queueMove(command.faction, command.entityIds, command.targetXQ10, command.targetYQ10);
    left.run(240);
    right.run(240);
    write("replay-final-checksum.json", {
      seed: left.seed,
      ticks: left.tick,
      orderedCommands: left.commands(),
      leftChecksum: left.checksum(),
      rightChecksum: right.checksum(),
      equal: left.checksum() === right.checksum(),
      snapshotBytes: new TextEncoder().encode(JSON.stringify(left.snapshot())).byteLength,
    });
    expect(left.checksum()).toBe(right.checksum());
  });
});
