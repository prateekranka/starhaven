/** Replay codec and recorder (side-by-side; float sim still authoritative). */

import { checksumSnapshot, snapshotWorld } from "./checksum.js";

export { checksumSnapshot };

export function encodeReplay(replay) {
  return `${JSON.stringify(replay)}\n`;
}

export function decodeReplay(encoded) {
  const replay = JSON.parse(encoded);
  if (replay.format !== "starhaven-replay-v1" || !Array.isArray(replay.commands) || !Array.isArray(replay.checksums)) {
    throw new Error("Invalid replay format");
  }
  return replay;
}

export class ReplayRecorder {
  constructor(seed) {
    this.data = { format: "starhaven-replay-v1", seed: seed >>> 0, commands: [], checksums: [] };
  }

  recordCommand(command) {
    this.data.commands.push({ ...command });
  }

  recordWorld(world) {
    const snapshot = snapshotWorld(world);
    this.data.checksums.push({ tick: snapshot.t, checksum: checksumSnapshot(snapshot) });
  }

  toJSON() {
    return JSON.stringify(this.data);
  }
}
