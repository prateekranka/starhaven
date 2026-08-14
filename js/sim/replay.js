/** Replay codec, recorder, and deterministic replay runner. */

import { createMatch, updateWorld, commandGround, queueUnit, tryAgeUp, tryPlace } from "./engine.js";
import { checksumSnapshot, checksumWorld, snapshotWorld } from "./checksum.js";

export { checksumSnapshot };

const DT = 1 / 60;

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

function applyReplayCommand(world, command) {
  switch (command.type) {
    case "move":
      if (Array.isArray(command.unitIds)) world.selection = command.unitIds.slice();
      commandGround(world, command.x, command.z, !!command.attackMove);
      break;
    case "train":
      if (command.buildingId != null && command.unitType) {
        const b = world.buildings.find((x) => x.id === command.buildingId);
        if (b) queueUnit(world, b, command.unitType);
      }
      break;
    case "place":
      if (command.buildingType) {
        tryPlace(world, command.owner || "player", command.buildingType, command.x, command.z);
      }
      break;
    case "ageUp":
      tryAgeUp(world, command.owner || "player");
      break;
    default:
      break;
  }
}

/** Replay a recorded match and return periodic checksums (deterministic proof). */
export function replayToChecksums(replay, maxTicks, interval = 60) {
  const world = createMatch({ seed: replay.seed });
  const checksums = [];
  let cmdIdx = 0;
  for (let step = 0; step < maxTicks; step += 1) {
    while (cmdIdx < replay.commands.length && replay.commands[cmdIdx].tick === world.simTick) {
      applyReplayCommand(world, replay.commands[cmdIdx]);
      cmdIdx += 1;
    }
    updateWorld(world, DT);
    const tick = world.simTick | 0;
    if (tick % interval === 0 || tick === maxTicks) {
      checksums.push({ tick, checksum: checksumWorld(world) });
    }
  }
  return checksums;
}

/** Replay commands up to targetTick and return the restored world. */
export function replayToWorld(replay, targetTick, matchOpts = {}) {
  const world = createMatch({ ...matchOpts, seed: replay.seed });
  let cmdIdx = 0;
  for (let step = 0; step < targetTick; step += 1) {
    while (cmdIdx < replay.commands.length && replay.commands[cmdIdx].tick === world.simTick) {
      applyReplayCommand(world, replay.commands[cmdIdx]);
      cmdIdx += 1;
    }
    updateWorld(world, DT);
  }
  return world;
}
