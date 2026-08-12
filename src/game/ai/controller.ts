import { BALANCE_V1 } from "../content/balance.v1";
import type { Faction } from "../content/schema";
import { chooseAiState, openingUnit, shouldEvaluateAi, type AiDecision } from "./baseline";
import type { SkirmishDifficulty, SkirmishMatch, SkirmishSnapshot } from "../sim/match";
import { q10FromWorld } from "../sim/fixed";

const AI_OBJECTIVE_TARGET = { xQ10: q10FromWorld(24), yQ10: q10FromWorld(16) };

export function runBaselineAi(match: SkirmishMatch, faction: Faction, difficulty: SkirmishDifficulty): AiDecision | null {
  const snapshot = match.snapshot();
  if (!shouldEvaluateAi(snapshot.tick, difficulty)) return null;
  const decision = chooseAiState(snapshot, faction);
  issueDecision(match, snapshot, decision);
  return decision;
}

function issueDecision(match: SkirmishMatch, snapshot: SkirmishSnapshot, decision: AiDecision): void {
  const ownUnits = snapshot.units.filter((unit) => unit.faction === decision.faction && unit.health > 0);
  const combatUnits = ownUnits.filter((unit) => unit.kind !== "loomkeeper" && unit.kind !== "prospector");
  const enemy = snapshot.units.find((unit) => unit.faction !== decision.faction && unit.health > 0);
  if (decision.state === "Opening") {
    const index = Math.trunc(snapshot.tick / BALANCE_V1.tickHz) % 4;
    const unitKind = openingUnit(decision.opening, index);
    if (unitKind !== null && snapshot.factions[decision.faction].production.length < 5) match.queueProduction(decision.faction, unitKind);
    return;
  }
  if (decision.state === "EmergencyDefend" || decision.state === "Regroup") {
    match.queueMove(decision.faction, ownUnits.map((unit) => unit.id), snapshot.factions[decision.faction].headquarters.xQ10, snapshot.factions[decision.faction].headquarters.yQ10);
    return;
  }
  if (decision.state === "Expand") {
    const builder = ownUnits.find((unit) => unit.kind === "loomkeeper" || unit.kind === "prospector");
    if (builder) match.queueBuild(decision.faction, [builder.id], "latticeField", q10FromWorld(22), q10FromWorld(decision.faction === "sunwoven" ? 8 : 24));
    return;
  }
  if (decision.state === "RecoverSupply" || decision.state === "HoldEngine" || decision.state === "ContestEngine") {
    match.queueMove(decision.faction, ownUnits.map((unit) => unit.id), AI_OBJECTIVE_TARGET.xQ10, AI_OBJECTIVE_TARGET.yQ10);
    return;
  }
  if (decision.state === "DisruptEngine" || decision.state === "Pressure") {
    if (enemy && combatUnits.length > 0) match.queueAttack(decision.faction, combatUnits.map((unit) => unit.id), enemy.id);
    else match.queueMove(decision.faction, combatUnits.map((unit) => unit.id), AI_OBJECTIVE_TARGET.xQ10, AI_OBJECTIVE_TARGET.yQ10);
  }
}
