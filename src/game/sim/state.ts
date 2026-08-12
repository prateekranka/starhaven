import { ARENA_V1, arenaNode } from "../content/arena.v1";
import type { Faction, UnitKind } from "../content/schema";
import { Q10 } from "./fixed";
import { MatchPrng, type PrngStreamsSnapshot } from "./prng";

export interface UnitState {
  id: number;
  faction: Faction;
  kind: UnitKind;
  xQ10: number;
  yQ10: number;
  targetXQ10: number;
  targetYQ10: number;
  remainderX: number;
  remainderY: number;
  health: number;
  maxHealth: number;
  selected: boolean;
}

export interface FactionState {
  faction: Faction;
  fluxMilli: number;
  population: number;
  unitIds: number[];
}

export interface MatchState {
  contentVersion: "arena.v1";
  simulationVersion: "sim.v1";
  seed: number;
  tick: number;
  nextEntityId: number;
  nextCommandId: number;
  units: UnitState[];
  factions: Record<Faction, FactionState>;
  fractureOpen: boolean;
  prng: MatchPrng;
  checksum: string;
}

export interface MatchSnapshot {
  contentVersion: "arena.v1";
  simulationVersion: "sim.v1";
  seed: number;
  tick: number;
  nextEntityId: number;
  nextCommandId: number;
  units: UnitState[];
  factions: Record<Faction, FactionState>;
  fractureOpen: boolean;
  prng: PrngStreamsSnapshot;
  checksum: string;
}

export function createInitialState(seed: number): MatchState {
  const state: MatchState = {
    contentVersion: "arena.v1",
    simulationVersion: "sim.v1",
    seed: seed >>> 0,
    tick: 0,
    nextEntityId: 1,
    nextCommandId: 1,
    units: [],
    factions: {
      sunwoven: { faction: "sunwoven", fluxMilli: 260_000, population: 0, unitIds: [] },
      gravemark: { faction: "gravemark", fluxMilli: 260_000, population: 0, unitIds: [] },
    },
    fractureOpen: false,
    prng: new MatchPrng(seed),
    checksum: "00000000",
  };
  spawnSymmetricStarter(state, "sunwoven", "sunWest");
  spawnSymmetricStarter(state, "gravemark", "gravemarkEast");
  return state;
}

export function spawnUnit(state: MatchState, faction: Faction, kind: UnitKind, xQ10: number, yQ10: number, maxHealth = 100): UnitState {
  const unit: UnitState = { id: state.nextEntityId, faction, kind, xQ10, yQ10, targetXQ10: xQ10, targetYQ10: yQ10, remainderX: 0, remainderY: 0, health: maxHealth, maxHealth, selected: false };
  state.nextEntityId += 1;
  state.units.push(unit);
  state.factions[faction].unitIds.push(unit.id);
  state.factions[faction].population += 1;
  return unit;
}

export function snapshotState(state: MatchState): MatchSnapshot {
  return {
    contentVersion: state.contentVersion,
    simulationVersion: state.simulationVersion,
    seed: state.seed,
    tick: state.tick,
    nextEntityId: state.nextEntityId,
    nextCommandId: state.nextCommandId,
    units: state.units.map((unit) => ({ ...unit })),
    factions: {
      sunwoven: { ...state.factions.sunwoven, unitIds: [...state.factions.sunwoven.unitIds] },
      gravemark: { ...state.factions.gravemark, unitIds: [...state.factions.gravemark.unitIds] },
    },
    fractureOpen: state.fractureOpen,
    prng: state.prng.snapshot(),
    checksum: state.checksum,
  };
}

export function restoreState(snapshot: MatchSnapshot): MatchState {
  const state: MatchState = {
    ...snapshot,
    units: snapshot.units.map((unit) => ({ ...unit })),
    factions: {
      sunwoven: { ...snapshot.factions.sunwoven, unitIds: [...snapshot.factions.sunwoven.unitIds] },
      gravemark: { ...snapshot.factions.gravemark, unitIds: [...snapshot.factions.gravemark.unitIds] },
    },
    prng: new MatchPrng(snapshot.seed),
  };
  state.prng.restore(snapshot.prng);
  return state;
}

function spawnSymmetricStarter(state: MatchState, faction: Faction, nodeId: "sunWest" | "gravemarkEast"): void {
  const node = arenaNode(nodeId);
  const direction = faction === "sunwoven" ? 1 : -1;
  spawnUnit(state, faction, faction === "sunwoven" ? "gleamrunner" : "stoneguard", node.xQ10, node.yQ10 - 2 * Q10, faction === "sunwoven" ? 125 : 180);
  spawnUnit(state, faction, faction === "sunwoven" ? "loomkeeper" : "prospector", node.xQ10, node.yQ10 + 2 * Q10, faction === "sunwoven" ? 155 : 175);
  spawnUnit(state, faction, faction === "sunwoven" ? "prospector" : "loomkeeper", node.xQ10 + direction * Q10, node.yQ10, faction === "sunwoven" ? 175 : 155);
  state.factions[faction].population += 0;
  if (ARENA_V1.width < 1) throw new Error("Arena is invalid");
}
