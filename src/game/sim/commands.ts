import type { Faction } from "../content/schema";

export type CommandType = "move" | "select" | "attack";

export interface MatchCommand {
  id: number;
  tick: number;
  issuer: Faction;
  type: CommandType;
  entityIds: number[];
  targetXQ10?: number;
  targetYQ10?: number;
  targetEntityId?: number;
}

export function compareCommands(left: MatchCommand, right: MatchCommand): number {
  return left.tick - right.tick || left.id - right.id;
}
