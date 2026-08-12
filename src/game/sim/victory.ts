import { BALANCE_V1 } from "../content/balance.v1";
import type { Faction } from "../content/schema";

export type MatchEndReason = "headquartersDestroyed" | "resonanceVictory" | "timeLimit";

export interface VictoryFactionStats {
  faction: Faction;
  resonanceMilli: number;
  ownedOutposts: number;
  headquartersHealth: number;
  headquartersMaxHealth: number;
  survivingUnitHealth: number;
  finalPriority: number;
}

export interface MatchEndResult {
  ended: true;
  winner: Faction;
  loser: Faction;
  reason: MatchEndReason;
  durationTicks: number;
  durationSeconds: number;
  finalTick: number;
  finalChecksum: string;
  seed: number;
  balanceVersion: 1;
  buildIdentity: string;
}

export function resolveMatchEnd(left: VictoryFactionStats, right: VictoryFactionStats, currentTick: number, checksum: string, seed: number, headquartersDestroyed: Faction | null = null, buildIdentity = "runtime"): MatchEndResult | null {
  if (headquartersDestroyed !== null) return makeResult(headquartersDestroyed, otherFaction(headquartersDestroyed), "headquartersDestroyed", currentTick, checksum, seed, buildIdentity);
  const resonanceWinner = resonanceWinnerOf(left, right);
  if (resonanceWinner !== null) return makeResult(resonanceWinner, otherFaction(resonanceWinner), "resonanceVictory", currentTick, checksum, seed, buildIdentity);
  if (currentTick < BALANCE_V1.match.finalTick) return null;
  const winner = compareAtTimeLimit(left, right);
  return makeResult(winner, otherFaction(winner), "timeLimit", BALANCE_V1.match.finalTick, checksum, seed, buildIdentity);
}

export function compareAtTimeLimit(left: VictoryFactionStats, right: VictoryFactionStats): Faction {
  if (left.resonanceMilli !== right.resonanceMilli) return left.resonanceMilli > right.resonanceMilli ? left.faction : right.faction;
  if (left.ownedOutposts !== right.ownedOutposts) return left.ownedOutposts > right.ownedOutposts ? left.faction : right.faction;
  const leftHealth = left.headquartersHealth * right.headquartersMaxHealth;
  const rightHealth = right.headquartersHealth * left.headquartersMaxHealth;
  if (leftHealth !== rightHealth) return leftHealth > rightHealth ? left.faction : right.faction;
  if (left.survivingUnitHealth !== right.survivingUnitHealth) return left.survivingUnitHealth > right.survivingUnitHealth ? left.faction : right.faction;
  if (left.finalPriority !== right.finalPriority) return left.finalPriority > right.finalPriority ? left.faction : right.faction;
  return left.faction < right.faction ? left.faction : right.faction;
}

function resonanceWinnerOf(left: VictoryFactionStats, right: VictoryFactionStats): Faction | null {
  const leftWins = left.resonanceMilli >= BALANCE_V1.resonance.victoryMilli;
  const rightWins = right.resonanceMilli >= BALANCE_V1.resonance.victoryMilli;
  if (!leftWins && !rightWins) return null;
  if (leftWins && !rightWins) return left.faction;
  if (rightWins && !leftWins) return right.faction;
  return left.resonanceMilli >= right.resonanceMilli ? left.faction : right.faction;
}

function otherFaction(faction: Faction): Faction {
  return faction === "sunwoven" ? "gravemark" : "sunwoven";
}

function makeResult(winner: Faction, loser: Faction, reason: MatchEndReason, durationTicks: number, checksum: string, seed: number, buildIdentity: string): MatchEndResult {
  return { ended: true, winner, loser, reason, durationTicks, durationSeconds: durationTicks / BALANCE_V1.tickHz, finalTick: durationTicks, finalChecksum: checksum, seed, balanceVersion: BALANCE_V1.balanceVersion, buildIdentity };
}
