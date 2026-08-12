import { BALANCE_V1 } from "../content/balance.v1";
import type { Faction } from "../content/schema";
import { chooseAiState, chooseOpening, openingUnitForFaction, shouldEvaluateAi, type AiDecision } from "./baseline";
import type { SkirmishDifficulty, SkirmishMatch, SkirmishSnapshot } from "../sim/match";
import { distanceSquared, q10FromWorld } from "../sim/fixed";

const AI_OBJECTIVE_TARGET = { xQ10: q10FromWorld(24), yQ10: q10FromWorld(16) };
const AI_OUTPOST_TARGETS = {
  sunwoven: { xQ10: q10FromWorld(22), yQ10: q10FromWorld(8) },
  gravemark: { xQ10: q10FromWorld(22), yQ10: q10FromWorld(24) },
} as const;

export function runBaselineAi(match: SkirmishMatch, faction: Faction, difficulty: SkirmishDifficulty): AiDecision | null {
  const snapshot = match.snapshot();
  if (!shouldEvaluateAi(snapshot.tick, difficulty)) return null;
  const decision = chooseAiState(snapshot, faction, openingForFaction(snapshot.seed, faction));
  issueDecision(match, snapshot, decision);
  return decision;
}

export function openingForFaction(seed: number, faction: Faction): "balanced" | "pressure" | "objective" {
  return chooseOpening((seed ^ (faction === "sunwoven" ? 0x53554e57 : 0x47524156)) >>> 0);
}

function issueDecision(match: SkirmishMatch, snapshot: SkirmishSnapshot, decision: AiDecision): void {
  const ownUnits = snapshot.units.filter((unit) => unit.faction === decision.faction && unit.health > 0);
  const combatUnits = ownUnits.filter((unit) => !unit.busyBuilding);
  const enemyUnits = snapshot.units.filter((unit) => unit.faction !== decision.faction && unit.health > 0);
  const enemy = decision.faction === "sunwoven"
    ? (decision.opening === "pressure"
      ? ((snapshot.seed & 1) === 1 ? enemyUnits.find((unit) => unit.kind === "riftCannon") : undefined) ?? enemyUnits[1] ?? enemyUnits[0]
      : enemyUnits.find((unit) => unit.kind === "riftCannon") ?? enemyUnits[0])
    : enemyUnits[0];
  if (decision.state === "Opening") {
    const index = Math.trunc(snapshot.tick / BALANCE_V1.tickHz) % 4;
    const unitKind = openingUnitForFaction(decision.faction, decision.opening, index);
    if (unitKind !== null && snapshot.factions[decision.faction].production.length < 5) match.queueProduction(decision.faction, unitKind);
    return;
  }
  if (decision.state === "EmergencyDefend" || decision.state === "Regroup") {
    match.queueMove(decision.faction, ownUnits.map((unit) => unit.id), snapshot.factions[decision.faction].headquarters.xQ10, snapshot.factions[decision.faction].headquarters.yQ10);
    return;
  }
  if (decision.state === "Expand") {
    const builder = ownUnits.find((unit) => unit.kind === "loomkeeper" || unit.kind === "prospector");
    if (builder) {
      const structureKind = decision.faction === "sunwoven" ? "latticeField" : "extractionBulwark";
      match.queueBuild(decision.faction, [builder.id], structureKind, q10FromWorld(22), q10FromWorld(decision.faction === "sunwoven" ? 8 : 24));
    }
    return;
  }
  if (decision.state === "RecoverSupply" || decision.state === "HoldEngine") {
    const target = decision.state === "RecoverSupply" ? AI_OUTPOST_TARGETS[decision.faction] : AI_OBJECTIVE_TARGET;
    match.queueMove(decision.faction, ownUnits.map((unit) => unit.id), target.xQ10, target.yQ10);
    return;
  }
  if (decision.state === "ContestEngine") {
    const nearbyEnemy = enemy && combatUnits.some((unit) => {
      const rangeQ10 = BALANCE_V1.units[unit.kind].rangeQ10 + q10FromWorld(0.5);
      return distanceSquared({ x: unit.xQ10, y: unit.yQ10 }, { x: enemy.xQ10, y: enemy.yQ10 }) <= rangeQ10 * rangeQ10;
    });
    if (enemy && nearbyEnemy && combatUnits.length > 0) {
      const stoneguard = combatUnits.find((unit) => unit.kind === "stoneguard");
      const counterPressure = decision.faction === "gravemark" && (decision.opening === "pressure" || decision.opening === "balanced") && openingForFaction(snapshot.seed, "sunwoven") === "pressure";
      if (stoneguard && enemy && shouldUseLunge(match, decision.faction, stoneguard.id, enemy.id, counterPressure)) match.queueLunge(decision.faction, [stoneguard.id], enemy.id);
      else match.queueAttack(decision.faction, combatUnits.map((unit) => unit.id), enemy.id);
    } else match.queueMove(decision.faction, ownUnits.map((unit) => unit.id), AI_OBJECTIVE_TARGET.xQ10, AI_OBJECTIVE_TARGET.yQ10);
    return;
  }
  if (decision.state === "DisruptEngine" || decision.state === "Pressure") {
    const stoneguard = combatUnits.find((unit) => unit.kind === "stoneguard");
    const counterPressure = decision.faction === "gravemark" && (decision.opening === "pressure" || decision.opening === "balanced") && openingForFaction(snapshot.seed, "sunwoven") === "pressure";
    if (stoneguard && enemy && shouldUseLunge(match, decision.faction, stoneguard.id, enemy.id, counterPressure)) match.queueLunge(decision.faction, [stoneguard.id], enemy.id);
    else if (enemy && combatUnits.length > 0) match.queueAttack(decision.faction, combatUnits.map((unit) => unit.id), enemy.id);
    else match.queueMove(decision.faction, combatUnits.map((unit) => unit.id), AI_OBJECTIVE_TARGET.xQ10, AI_OBJECTIVE_TARGET.yQ10);
  }
}

function shouldUseLunge(match: SkirmishMatch, faction: Faction, attackerId: number, targetId: number, aggressive = false): boolean {
  if (!match.canQueueLunge(faction, attackerId, targetId)) return false;
  if (aggressive) return true;
  const snapshot = match.snapshot();
  const attacker = snapshot.units.find((unit) => unit.id === attackerId);
  const target = snapshot.units.find((unit) => unit.id === targetId);
  if (!attacker || !target) return false;
  return distanceSquared({ x: attacker.xQ10, y: attacker.yQ10 }, { x: target.xQ10, y: target.yQ10 }) >= q10FromWorld(2.5) ** 2;
}
