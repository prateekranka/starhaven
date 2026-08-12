import { BALANCE_V1 } from "../content/balance.v1";
import type { Faction } from "../content/schema";

export type StructureKind = "latticeField" | "extractionBulwark";

export interface StructureState {
  id: number;
  faction: Faction;
  kind: StructureKind;
  xQ10: number;
  yQ10: number;
  health: number;
  maxHealth: number;
  buildStartedTick: number;
  completeTick: number;
  completed: boolean;
  expiresTick: number | null;
}

export interface StructureRefund {
  structureId: number;
  faction: Faction;
  refundMilliFlux: number;
}

export function startConstruction(id: number, faction: Faction, kind: StructureKind, xQ10: number, yQ10: number, currentTick: number): StructureState {
  const definition = BALANCE_V1.structures[kind];
  const lifeTicks = kind === "latticeField" ? BALANCE_V1.structures.latticeField.lifeTicks : undefined;
  return { id, faction, kind, xQ10, yQ10, health: definition.maxHealth, maxHealth: definition.maxHealth, buildStartedTick: currentTick, completeTick: currentTick + definition.buildTicks, completed: false, expiresTick: lifeTicks === undefined ? null : currentTick + definition.buildTicks + lifeTicks };
}

export function advanceConstruction(structure: StructureState, currentTick: number): boolean {
  if (!structure.completed && currentTick >= structure.completeTick) structure.completed = true;
  return structure.completed;
}

export function cancelConstruction(structure: StructureState): StructureRefund {
  const definition = BALANCE_V1.structures[structure.kind];
  return { structureId: structure.id, faction: structure.faction, refundMilliFlux: Math.trunc(definition.refundMilliFlux) };
}

export function destroyStructure(structure: StructureState): StructureRefund {
  const definition = BALANCE_V1.structures[structure.kind];
  return { structureId: structure.id, faction: structure.faction, refundMilliFlux: structure.completed ? 0 : Math.trunc(definition.refundMilliFlux) };
}

export function structureIsActive(structure: StructureState, currentTick: number): boolean {
  return structure.health > 0 && (structure.expiresTick === null || currentTick < structure.expiresTick);
}
