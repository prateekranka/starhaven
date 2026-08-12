import type { MatchCommand } from "../sim/commands";
import type { MatchSnapshot } from "../sim/state";
import { Simulation } from "../sim/simulation";
import { checksumSnapshot } from "./checksum";

export interface ReplayData {
  format: "starhaven-replay-v1";
  seed: number;
  commands: MatchCommand[];
  checksums: Array<{ tick: number; checksum: string }>;
}

export class ReplayRecorder {
  readonly data: ReplayData;

  constructor(seed: number) {
    this.data = { format: "starhaven-replay-v1", seed, commands: [], checksums: [] };
  }

  recordCommand(command: MatchCommand): void {
    this.data.commands.push({ ...command, entityIds: [...command.entityIds] });
  }

  recordSnapshot(snapshot: MatchSnapshot): void {
    this.data.checksums.push({ tick: snapshot.tick, checksum: checksumSnapshot(snapshot) });
  }

  toJSON(): string {
    return JSON.stringify(this.data);
  }
}

export function replayToChecksums(replay: ReplayData, endTick: number): string[] {
  const simulation = new Simulation({ seed: replay.seed });
  for (const command of replay.commands) simulation.queueCommand(command);
  const checksums: string[] = [];
  while (simulation.tick < endTick) {
    simulation.step();
    checksums.push(simulation.checksum());
  }
  return checksums;
}
