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
  for (let tick = 0; tick < maxTicks; tick += 1) {
    while (cmdIdx < replay.commands.length && replay.commands[cmdIdx].tick === tick) {
      applyReplayCommand(world, replay.commands[cmdIdx]);
      cmdIdx += 1;
    }
    updateWorld(world, DT);
    if ((tick + 1) % interval === 0 || tick + 1 === maxTicks) {
      checksums.push({ tick: world.t, checksum: checksumWorld(world) });
    }
  }
  return checksums;
}

/** Replay commands up to targetTick and return the restored world. */
export function replayToWorld(replay, targetTick, matchOpts = {}) {
  const world = createMatch({ ...matchOpts, seed: replay.seed });
  let cmdIdx = 0;
  for (let tick = 0; tick < targetTick; tick += 1) {
    while (cmdIdx < replay.commands.length && replay.commands[cmdIdx].tick === tick) {
      applyReplayCommand(world, replay.commands[cmdIdx]);
      cmdIdx += 1;
    }
    updateWorld(world, DT);
  }
  return world;
}

/** Record a harness match with periodic checksum snapshots. */
export function recordHarnessMatch(opts = {}) {
  const seed = opts.seed ?? 0x4d455249;
  const ticks = opts.ticks ?? 240;
  const interval = opts.interval ?? 60;
  const recorder = new ReplayRecorder(seed);
  const world = createMatch({ seed, playerFaction: "sunwoven", difficulty: "chieftain" });
  for (let i = 0; i < ticks; i += 1) {
    updateWorld(world, DT);
    if ((i + 1) % interval === 0 || i + 1 === ticks) recorder.recordWorld(world);
  }
  return { recorder, world, finalChecksum: checksumWorld(world) };
}
