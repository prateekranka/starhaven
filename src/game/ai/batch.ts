import { runBaselineAi } from "./controller";
import { openingForFaction as openingForFactionValue } from "./controller";
import type { Faction } from "../content/schema";
import { BALANCE_V1 } from "../content/balance.v1";
import { SkirmishMatch, type SkirmishDifficulty } from "../sim/match";

export interface AiTransition {
  tick: number;
  faction: Faction;
  from: string | null;
  to: string;
  opening: string;
}

export interface AiBatchResult {
  seed: number;
  sunwovenOpening: string;
  gravemarkOpening: string;
  winner: Faction;
  loser: Faction;
  reason: string;
  durationTicks: number;
  durationSeconds: number;
  checksum: string;
  sunwovenOutposts: number;
  gravemarkOutposts: number;
  sunwovenSurvivingHealth: number;
  gravemarkSurvivingHealth: number;
  complete: boolean;
  transitions: AiTransition[];
}

export function runAiVsAi(seed: number, difficulty: SkirmishDifficulty = "standard"): AiBatchResult {
  const match = new SkirmishMatch({ seed, playerFaction: "sunwoven", difficulty, buildIdentity: "C5 AI batch" });
  const transitions: AiTransition[] = [];
  const lastState: Record<Faction, string | null> = { sunwoven: null, gravemark: null };
  const openings = { sunwoven: openingForFactionValue(seed, "sunwoven"), gravemark: openingForFactionValue(seed, "gravemark") };
  while (!match.ended && match.tick < BALANCE_V1.match.finalTick) {
    for (const faction of ["sunwoven", "gravemark"] as const) {
      const decision = runBaselineAi(match, faction, difficulty);
      if (!decision) continue;
      if (lastState[faction] !== decision.state) {
        transitions.push({ tick: match.tick, faction, from: lastState[faction], to: decision.state, opening: decision.opening });
        lastState[faction] = decision.state;
      }
    }
    match.step();
  }
  const result = match.ended;
  if (!result) throw new Error(`AI match ${seed} did not complete by the final tick`);
  return {
    seed,
    sunwovenOpening: openings.sunwoven,
    gravemarkOpening: openings.gravemark,
    winner: result.winner,
    loser: result.loser,
    reason: result.reason,
    durationTicks: result.durationTicks,
    durationSeconds: result.durationSeconds,
    checksum: result.finalChecksum,
    sunwovenOutposts: match.ownedOutposts("sunwoven"),
    gravemarkOutposts: match.ownedOutposts("gravemark"),
    sunwovenSurvivingHealth: match.snapshot().units.filter((unit) => unit.faction === "sunwoven" && unit.health > 0).reduce((sum, unit) => sum + unit.health, 0),
    gravemarkSurvivingHealth: match.snapshot().units.filter((unit) => unit.faction === "gravemark" && unit.health > 0).reduce((sum, unit) => sum + unit.health, 0),
    complete: result.ended,
    transitions,
  };
}
