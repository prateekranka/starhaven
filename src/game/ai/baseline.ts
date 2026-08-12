import { BALANCE_V1 } from "../content/balance.v1";
import type { Faction, UnitKind } from "../content/schema";
import { distanceSquared, q10FromWorld } from "../sim/fixed";
import type { SkirmishSnapshot, SkirmishUnit } from "../sim/match";

export type AiState = "EmergencyDefend" | "RecoverSupply" | "DisruptEngine" | "HoldEngine" | "ContestEngine" | "Regroup" | "Expand" | "Pressure" | "Opening";
export type AiOpening = "balanced" | "pressure" | "objective";

export interface AiDecision {
  faction: Faction;
  state: AiState;
  opening: AiOpening;
  tick: number;
  armyValueMilliFlux: number;
  averageHealthPercent: number;
  command: "defend" | "recover" | "engine" | "regroup" | "expand" | "pressure" | "opening";
}

export const OPENINGS: Readonly<Record<AiOpening, readonly UnitKind[]>> = {
  balanced: ["gleamrunner", "loomkeeper", "gleamrunner", "prismLancer"],
  pressure: ["gleamrunner", "gleamrunner", "gleamrunner", "loomkeeper"],
  objective: ["loomkeeper", "gleamrunner", "prismLancer", "gleamrunner"],
};

const FACTION_OPENINGS: Readonly<Record<Faction, Readonly<Record<AiOpening, readonly UnitKind[]>>>> = {
  sunwoven: OPENINGS,
  gravemark: {
    balanced: ["stoneguard", "prospector", "stoneguard", "riftCannon"],
    pressure: ["stoneguard", "stoneguard", "stoneguard", "prospector"],
    objective: ["prospector", "stoneguard", "riftCannon", "stoneguard"],
  },
};

export const AI_DIFFICULTY = {
  explorer: { intervalTicks: 20, delayTicks: 10, populationCap: 12 },
  standard: { intervalTicks: 10, delayTicks: 4, populationCap: 18 },
  vanguard: { intervalTicks: 5, delayTicks: 0, populationCap: 18 },
} as const;

export function armyValueMilliFlux(units: readonly SkirmishUnit[], faction: Faction): number {
  return units.filter((unit) => unit.faction === faction).reduce((value, unit) => {
    const cost = BALANCE_V1.units[unit.kind].costMilliFlux;
    return value + Math.trunc(cost * Math.max(0, unit.health) / unit.maxHealth);
  }, 0);
}

export function averageHealthPercent(units: readonly SkirmishUnit[], faction: Faction): number {
  const factionUnits = units.filter((unit) => unit.faction === faction && unit.health > 0);
  if (factionUnits.length === 0) return 0;
  const health = factionUnits.reduce((value, unit) => value + unit.health, 0);
  const maximum = factionUnits.reduce((value, unit) => value + unit.maxHealth, 0);
  return Math.trunc(health * 100 / Math.max(1, maximum));
}

export function chooseOpening(seed: number): AiOpening {
  const value = (seed ^ 0x41490001) >>> 0;
  return value % 3 === 0 ? "balanced" : value % 3 === 1 ? "pressure" : "objective";
}

export function chooseAiState(snapshot: SkirmishSnapshot, faction: Faction, opening = chooseOpening(snapshot.seed)): AiDecision {
  const opponent: Faction = faction === "sunwoven" ? "gravemark" : "sunwoven";
  const enemyUnits = snapshot.units.filter((unit) => unit.faction === opponent && unit.health > 0);
  const headquarters = snapshot.factions[faction].headquarters;
  const enemyNearHeadquarters = enemyUnits.some((unit) => distanceSquared({ x: unit.xQ10, y: unit.yQ10 }, { x: headquarters.xQ10, y: headquarters.yQ10 }) <= q10FromWorld(8) * q10FromWorld(8));
  const ownOutposts = [snapshot.outposts.northOutpost, snapshot.outposts.southOutpost].filter((objective) => objective.owner === faction).length;
  const enemyResonance = snapshot.factions[opponent].resonanceMilli;
  const armyValue = armyValueMilliFlux(snapshot.units, faction);
  const averageHealth = averageHealthPercent(snapshot.units, faction);
  let state: AiState = "Opening";
  if (enemyNearHeadquarters || headquarters.health * 100 < headquarters.maxHealth * 40) state = "EmergencyDefend";
  else if (ownOutposts === 0) state = "RecoverSupply";
  else if (enemyResonance >= BALANCE_V1.resonance.victoryMilli - 30) state = "DisruptEngine";
  else if (snapshot.engine.owner === faction && ownOutposts > 0) state = "HoldEngine";
  else if (snapshot.fractureOpen && ownOutposts > 0 && armyValue >= 260_000) state = "ContestEngine";
  else if (armyValue < 180_000 || averageHealth < 55) state = "Regroup";
  else if (!snapshot.fractureOpen && ownOutposts === 1 && armyValue >= 230_000) state = "Expand";
  else if (ownOutposts > 0 && armyValue >= 300_000) state = "Pressure";
  const command = state === "EmergencyDefend" ? "defend" : state === "RecoverSupply" ? "recover" : state === "DisruptEngine" || state === "HoldEngine" || state === "ContestEngine" ? "engine" : state === "Regroup" ? "regroup" : state === "Expand" ? "expand" : state === "Pressure" ? "pressure" : "opening";
  return { faction, state, opening, tick: snapshot.tick, armyValueMilliFlux: armyValue, averageHealthPercent: averageHealth, command };
}

export function shouldEvaluateAi(tick: number, difficulty: keyof typeof AI_DIFFICULTY): boolean {
  return tick > 0 && tick % AI_DIFFICULTY[difficulty].intervalTicks === 0;
}

export function openingUnit(opening: AiOpening, index: number): UnitKind | null {
  return OPENINGS[opening][index] ?? null;
}

export function openingUnitForFaction(faction: Faction, opening: AiOpening, index: number): UnitKind | null {
  return FACTION_OPENINGS[faction][opening][index] ?? null;
}
