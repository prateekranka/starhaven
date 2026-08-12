import type { ArenaDefinition } from "./schema";

const q10 = (worldUnits: number): number => worldUnits * 1024;

export const ARENA_V1: ArenaDefinition = {
  id: "meridian-breach",
  width: 48,
  height: 32,
  nodes: [
    { id: "sunWest", xQ10: q10(5), yQ10: q10(16) },
    { id: "westLane", xQ10: q10(15), yQ10: q10(16) },
    { id: "northOutpost", xQ10: q10(22), yQ10: q10(8) },
    { id: "engine", xQ10: q10(24), yQ10: q10(16) },
    { id: "southOutpost", xQ10: q10(22), yQ10: q10(24) },
    { id: "eastLane", xQ10: q10(33), yQ10: q10(16) },
    { id: "gravemarkEast", xQ10: q10(43), yQ10: q10(16) },
  ],
  edges: [
    { id: "sunWestLane", from: "sunWest", to: "westLane", cost: 10, fractureClosed: false },
    { id: "westLaneNorth", from: "westLane", to: "northOutpost", cost: 12, fractureClosed: false },
    { id: "westLaneSouth", from: "westLane", to: "southOutpost", cost: 12, fractureClosed: false },
    { id: "northEngine", from: "northOutpost", to: "engine", cost: 9, fractureClosed: true },
    { id: "southEngine", from: "southOutpost", to: "engine", cost: 9, fractureClosed: true },
    { id: "engineEastNorth", from: "engine", to: "eastLane", cost: 9, fractureClosed: true },
    { id: "engineEastSouth", from: "engine", to: "eastLane", cost: 9, fractureClosed: true },
    { id: "eastLaneBase", from: "eastLane", to: "gravemarkEast", cost: 10, fractureClosed: false },
  ],
  cells: Array.from({ length: 48 * 32 }, (_, index) => {
    const x = index % 48;
    const y = Math.floor(index / 48);
    const lane = y === 16 || x === 24 || y === 8 || y === 24;
    return { terrain: lane ? "lane" : "field", heightBand: lane ? 1 : 0, movementCost: lane ? 1 : 2, buildable: !lane };
  }),
};

export const arenaNode = (id: ArenaDefinition["nodes"][number]["id"]): ArenaDefinition["nodes"][number] => {
  const node = ARENA_V1.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`Unknown arena node: ${id}`);
  return node;
};
