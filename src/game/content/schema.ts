export type Faction = "sunwoven" | "gravemark";
export type UnitKind = "gleamrunner" | "loomkeeper" | "prismLancer" | "stoneguard" | "prospector" | "riftCannon";
export type NodeId = "sunWest" | "westLane" | "northOutpost" | "engine" | "southOutpost" | "eastLane" | "gravemarkEast";

export interface ArenaCell {
  terrain: "lane" | "field" | "ridge";
  heightBand: number;
  movementCost: number;
  buildable: boolean;
}

export interface ArenaNode {
  id: NodeId;
  xQ10: number;
  yQ10: number;
}

export interface ArenaEdge {
  id: "sunWestLane" | "westLaneNorth" | "westLaneSouth" | "northEngine" | "southEngine" | "engineEastNorth" | "engineEastSouth" | "eastLaneBase";
  from: NodeId;
  to: NodeId;
  cost: number;
  fractureClosed: boolean;
}

export interface ArenaDefinition {
  id: "meridian-breach";
  width: 48;
  height: 32;
  nodes: readonly ArenaNode[];
  edges: readonly ArenaEdge[];
  cells: readonly ArenaCell[];
}

export interface UnitDefinition {
  kind: UnitKind;
  costMilliFlux: number;
  buildTicks: number;
  population: number;
  maxHealth: number;
  damage: number;
  cadenceTicks: number;
  rangeQ10: number;
  speedQ10PerTick: number;
}
